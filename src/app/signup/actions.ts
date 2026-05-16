'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { PRIVACY_POLICY_LAST_UPDATED } from '@/app/privacy/page'
import { TERMS_OF_SERVICE_LAST_UPDATED } from '@/app/terms/page'
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_RESENDS,
  OTP_TTL_MINUTES,
  generateOtp,
  hashOtp,
} from '@/lib/auth/otp'
import { validatePassword } from '@/lib/auth/password'
import { currencyForLocale } from '@/lib/billing/currency'
import { TRIAL_DAYS, TRIAL_STORAGE_BYTES } from '@/lib/billing/trial'
import { getLocale } from '@/lib/i18n/get-locale'
import { BRAND } from '@/lib/brand'
import { decryptString, encryptString } from '@/lib/crypto/aes'
import {
  sendSignupOtpEmail,
  sendTrialWelcomeEmail,
} from '@/lib/email/send'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { slugify, uniqueSlug } from '@/lib/utils/slugify'

export type SignupActionResult = { error?: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Per-IP / per-email throttle on the initial OTP-request step. Self-serve
// is gated by the OTP, but rate-limiting the *send* side stops a bot from
// using us to spam arbitrary inboxes.
const RATE_WINDOW_MINUTES = 15
const RATE_LIMIT_PER_IP = 5
const RATE_LIMIT_PER_EMAIL = 3

// ---------------------------------------------------------------------------
// Step 1: form submission → store pending row + send OTP
// ---------------------------------------------------------------------------

/**
 * Validates the signup form, stores an encrypted-password pending
 * record, and emails a 6-digit code. Redirects to /signup/verify so
 * the user enters the code. The auth user, org, and property are NOT
 * created until {@link verifySignupOtp} confirms the code.
 *
 * Two layers of bot protection: a honeypot ("website" field) and
 * IP/email rate limits backed by tenant_signup_requests.created_at.
 * The OTP itself is the strongest layer — a bot that doesn't read
 * email cannot finish the signup.
 */
export async function submitSignupRequest(
  _prev: SignupActionResult,
  formData: FormData,
): Promise<SignupActionResult> {
  const honeypot = String(formData.get('website') ?? '')
  if (honeypot.trim()) {
    // Bot. Silently redirect so it stops retrying.
    redirect('/login')
  }

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const fullName = String(formData.get('full_name') ?? '').trim()
  const hotelName = String(formData.get('hotel_name') ?? '').trim()
  const consent = formData.get('consent') === 'yes'

  if (!email || !fullName || !hotelName || !password) {
    return { error: 'Email, password, your name, and hotel name are required.' }
  }
  if (!EMAIL_RE.test(email)) {
    return { error: 'Please enter a valid email address.' }
  }
  if (fullName.length > 200 || hotelName.length > 200) {
    return { error: 'That looks too long — keep names under 200 characters.' }
  }
  const pwCheck = validatePassword(password)
  if (!pwCheck.ok) return { error: pwCheck.error }
  if (!consent) {
    return {
      error: 'Please agree to the Terms of Service and Privacy Policy to continue.',
    }
  }

  const ipAddress = await getClientIp()
  const admin = createAdminClient()
  const since = new Date(
    Date.now() - RATE_WINDOW_MINUTES * 60 * 1000,
  ).toISOString()

  if (ipAddress) {
    const { count: ipCount } = await admin
      .from('tenant_signup_requests')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ipAddress)
      .gte('created_at', since)
    if ((ipCount ?? 0) >= RATE_LIMIT_PER_IP) {
      return {
        error: `Too many signup attempts from this network. Try again in a few minutes, or email ${BRAND.supportEmail}.`,
      }
    }
  }
  const { count: emailCount } = await admin
    .from('tenant_signup_requests')
    .select('id', { count: 'exact', head: true })
    .ilike('email', email)
    .gte('created_at', since)
  if ((emailCount ?? 0) >= RATE_LIMIT_PER_EMAIL) {
    return {
      error: `We've sent a code to ${email} recently. Check your inbox or wait a few minutes before trying again.`,
    }
  }

  // Account-takeover guard. Without this, a bot that brute-forces the
  // OTP space could reset a victim's password by signing up under
  // their address — the rate limits would slow but not stop it.
  if (await emailHasAuthUser(email)) {
    return {
      error: `${email} already has a ${BRAND.name} account. Log in or reset your password instead.`,
    }
  }

  // Generate + persist the pending row. Upsert on email so a second
  // submission for the same address rotates the OTP rather than
  // accumulating rows. password_enc is AES-GCM under
  // SIGNUP_ENCRYPTION_KEY; if the key is misconfigured the call below
  // throws and the user sees a generic error — fail closed.
  const code = generateOtp()
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)
  let password_enc: string
  try {
    password_enc = encryptString(password)
  } catch (err) {
    console.error('[signup] password encryption failed', err)
    return { error: 'Signup is temporarily unavailable. Please try again later.' }
  }

  const { error: upsertErr } = await admin
    .from('signup_pending')
    .upsert(
      {
        email,
        full_name: fullName,
        hotel_name: hotelName,
        password_enc,
        otp_hash: hashOtp(code),
        attempts: 0,
        expires_at: expiresAt.toISOString(),
        ip_address: ipAddress,
        resends: 0,
        resent_at: null,
      },
      { onConflict: 'email' },
    )
  if (upsertErr) {
    console.error('[signup] signup_pending upsert failed', upsertErr)
    return { error: 'Something went wrong. Please try again.' }
  }

  // Audit row for the rate-limit query above. We deliberately leave
  // it status='pending' — promoted to 'approved' only after the OTP
  // is verified and the org is provisioned.
  await admin.from('tenant_signup_requests').insert({
    email,
    full_name: fullName,
    hotel_name: hotelName,
    ip_address: ipAddress,
    status: 'pending',
    agreed_at: new Date().toISOString(),
    agreed_terms_version: TERMS_OF_SERVICE_LAST_UPDATED,
    agreed_privacy_version: PRIVACY_POLICY_LAST_UPDATED,
  })

  await sendSignupOtpEmail({
    to: email,
    recipientName: fullName,
    hotelName,
    code,
    ttlMinutes: OTP_TTL_MINUTES,
  }).catch((err) => {
    console.warn('[signup] OTP email dispatch failed', err)
  })

  redirect(`/signup/verify?email=${encodeURIComponent(email)}`)
}

// ---------------------------------------------------------------------------
// Step 2: OTP entry → provision + sign in
// ---------------------------------------------------------------------------

/**
 * Validates the OTP and, on success, provisions the tenant
 * atomically: org → property → auth user → profile → sign-in cookie.
 * On wrong-code submission the attempts counter increments; after
 * {@link OTP_MAX_ATTEMPTS} the pending row is invalidated and the
 * user has to resend.
 */
export async function verifySignupOtp(
  _prev: SignupActionResult,
  formData: FormData,
): Promise<SignupActionResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const code = String(formData.get('code') ?? '').trim()
  if (!email || !code) return { error: 'Enter the code from your email.' }
  if (!/^\d+$/.test(code) || code.length !== OTP_LENGTH) {
    return { error: `The code is ${OTP_LENGTH} digits.` }
  }

  const admin = createAdminClient()
  const { data: pending, error: pendErr } = await admin
    .from('signup_pending')
    .select('*')
    .ilike('email', email)
    .maybeSingle()
  if (pendErr) {
    console.error('[signup] verify lookup failed', pendErr)
    return { error: 'Something went wrong. Please try again.' }
  }
  if (!pending) {
    return {
      error:
        "We don't have a pending signup for that email. Start over from /signup.",
    }
  }
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    await admin.from('signup_pending').delete().eq('id', pending.id)
    return { error: 'That code has expired. Start over from /signup.' }
  }
  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    await admin.from('signup_pending').delete().eq('id', pending.id)
    return {
      error: 'Too many wrong codes. Start over from /signup.',
    }
  }
  if (hashOtp(code) !== pending.otp_hash) {
    await admin
      .from('signup_pending')
      .update({ attempts: pending.attempts + 1 })
      .eq('id', pending.id)
    const left = Math.max(0, OTP_MAX_ATTEMPTS - (pending.attempts + 1))
    return {
      error:
        left > 0
          ? `That code doesn’t match. ${left} attempt${left === 1 ? '' : 's'} left.`
          : 'That code doesn’t match. Start over from /signup.',
    }
  }

  // OTP verified. Decrypt the password and provision the tenant.
  let password: string
  try {
    password = decryptString(pending.password_enc)
  } catch (err) {
    console.error('[signup] password decryption failed', err)
    return { error: 'Signup is temporarily unavailable. Please try again later.' }
  }

  // Re-check email-collision right before creating the auth user so
  // we don't race with another concurrent signup.
  if (await emailHasAuthUser(email)) {
    await admin.from('signup_pending').delete().eq('id', pending.id)
    return {
      error: `${email} already has a ${BRAND.name} account. Log in instead.`,
    }
  }

  const { data: existingOrgs } = await admin
    .from('organizations')
    .select('slug')
  const takenSlugs = new Set((existingOrgs ?? []).map((o) => o.slug))
  const orgSlug = uniqueSlug(
    slugify(pending.hotel_name) || 'hotel',
    (s) => takenSlugs.has(s),
  )

  const trialStart = new Date()
  const trialEnd = new Date(
    trialStart.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
  )

  // Currency is set once at signup from the visitor's locale and
  // never changes for this org. Mid-stream currency switches on a
  // Stripe Customer are messy, and locale-at-signup is a good enough
  // proxy for the customer's billing currency preference. Operator
  // can override via direct SQL in the rare case a customer asks.
  const locale = await getLocale()
  const currency = currencyForLocale(locale)

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      slug: orgSlug,
      name: pending.hotel_name,
      trial_started_at: trialStart.toISOString(),
      trial_ends_at: trialEnd.toISOString(),
      currency,
    })
    .select('id')
    .single()
  if (orgErr || !org) {
    console.error('[signup] org insert failed', orgErr)
    return { error: 'Something went wrong creating your account. Please try again.' }
  }

  const propertySlug = uniqueSlug(
    slugify(pending.hotel_name) || 'main',
    () => false,
  )
  const { error: propErr } = await admin.from('properties').insert({
    org_id: org.id,
    slug: propertySlug,
    name: pending.hotel_name,
    r2_prefix: `${orgSlug}/${propertySlug}/`,
    storage_quota_bytes: TRIAL_STORAGE_BYTES,
  })
  if (propErr) {
    console.error('[signup] property insert failed', propErr)
    await admin.from('organizations').delete().eq('id', org.id)
    return { error: 'Something went wrong creating your account. Please try again.' }
  }

  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: pending.full_name },
  })
  if (userErr || !created.user) {
    console.error('[signup] auth user create failed', userErr)
    await admin.from('organizations').delete().eq('id', org.id)
    return { error: userErr?.message ?? 'Could not create your login. Please try again.' }
  }
  const userId = created.user.id

  const { error: profileErr } = await admin.from('profiles').upsert({
    id: userId,
    org_id: org.id,
    role: 'org_owner',
    full_name: pending.full_name,
  })
  if (profileErr) {
    console.error('[signup] profile upsert failed', profileErr)
    await admin.auth.admin.deleteUser(userId)
    await admin.from('organizations').delete().eq('id', org.id)
    return { error: 'Something went wrong setting up your profile. Please try again.' }
  }

  // Promote the audit row + clean up the pending row.
  await admin
    .from('tenant_signup_requests')
    .update({
      status: 'approved',
      approved_org_id: org.id,
      approved_at: new Date().toISOString(),
      email_verified_at: new Date().toISOString(),
    })
    .ilike('email', email)
    .eq('status', 'pending')
  await admin.from('signup_pending').delete().eq('id', pending.id)

  // Dedicated trial-welcome email (NOT sendWelcomeEmail — that one
  // reads like an invite from a manager). Best-effort.
  void sendTrialWelcomeEmail({
    to: email,
    recipientName: pending.full_name,
    hotelName: pending.hotel_name,
    trialDays: TRIAL_DAYS,
    storageGb: Math.round(TRIAL_STORAGE_BYTES / 1024 ** 3),
  }).catch((err) => {
    console.warn('[signup] trial-welcome email failed', err)
  })

  // Sign in via the cookie-bound anon client so /dashboard sees a
  // logged-in session immediately.
  const supabase = await createClient()
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (signInErr) {
    console.warn('[signup] auto sign-in failed', signInErr)
    redirect('/login?signed_up=1')
  }
  redirect('/dashboard?welcome=trial')
}

// ---------------------------------------------------------------------------
// Step 1b: resend the OTP (rate-limited per-row, not just per-IP)
// ---------------------------------------------------------------------------

/**
 * Send a fresh OTP for an in-flight signup. Caps resends per pending
 * row so we can't be turned into an email-amplifier toward a victim's
 * inbox even if rate limits are circumvented from a botnet.
 */
export async function resendSignupOtp(
  _prev: SignupActionResult,
  formData: FormData,
): Promise<SignupActionResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) {
    return { error: 'We need a valid email to resend the code.' }
  }
  const admin = createAdminClient()
  const { data: pending } = await admin
    .from('signup_pending')
    .select('*')
    .ilike('email', email)
    .maybeSingle()
  if (!pending) {
    return { error: 'No pending signup for that email. Start over from /signup.' }
  }
  if (pending.resends >= OTP_MAX_RESENDS) {
    return { error: 'Too many resends. Start over from /signup.' }
  }
  // Minimum 30s between resends so the button can't be hammered.
  if (pending.resent_at) {
    const since = Date.now() - new Date(pending.resent_at).getTime()
    if (since < 30_000) {
      return { error: 'Hang on a moment before requesting another code.' }
    }
  }

  const code = generateOtp()
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)
  await admin
    .from('signup_pending')
    .update({
      otp_hash: hashOtp(code),
      attempts: 0,
      expires_at: expiresAt.toISOString(),
      resends: pending.resends + 1,
      resent_at: new Date().toISOString(),
    })
    .eq('id', pending.id)

  await sendSignupOtpEmail({
    to: email,
    recipientName: pending.full_name,
    hotelName: pending.hotel_name,
    code,
    ttlMinutes: OTP_TTL_MINUTES,
  }).catch((err) => {
    console.warn('[signup] OTP resend dispatch failed', err)
  })

  return {}
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
async function emailHasAuthUser(email: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  return (data?.users ?? []).some(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  )
}

async function getClientIp(): Promise<string | null> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return h.get('x-real-ip')
}
