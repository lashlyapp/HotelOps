'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { PRIVACY_POLICY_LAST_UPDATED } from '@/app/privacy/page'
import { TERMS_OF_SERVICE_LAST_UPDATED } from '@/app/terms/page'
import { validatePassword } from '@/lib/auth/password'
import { TRIAL_DAYS, TRIAL_STORAGE_BYTES } from '@/lib/billing/trial'
import { BRAND } from '@/lib/brand'
import { sendWelcomeEmail } from '@/lib/email/send'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { slugify, uniqueSlug } from '@/lib/utils/slugify'

export type SignupActionResult = { error?: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Per-IP / per-email throttle. Self-serve provisioning creates a real
// auth user + org so we want a tight cap; legitimate hotel owners
// don't sign up multiple times in 15 minutes.
const RATE_WINDOW_MINUTES = 15
const RATE_LIMIT_PER_IP = 5
const RATE_LIMIT_PER_EMAIL = 2

/**
 * Self-serve signup. Creates the auth user, org, owner profile, one
 * starter property scoped to the {@link TRIAL_STORAGE_BYTES} cap, and
 * opens a {@link TRIAL_DAYS}-day no-credit-card trial window — then
 * signs the user in and redirects to /dashboard.
 *
 * Errors short-circuit with a typed result so the form can render
 * inline messages without a page round-trip.
 */
export async function submitSignupRequest(
  _prev: SignupActionResult,
  formData: FormData,
): Promise<SignupActionResult> {
  const honeypot = String(formData.get('website') ?? '')
  if (honeypot.trim()) {
    // Bot. Silently 200 so they stop retrying.
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
      error: `We’ve already received recent signups for ${email}. Try logging in, or wait a few minutes.`,
    }
  }

  // Account-takeover guard. The form is publicly writable; without
  // this an attacker could submit a victim's email and trigger a
  // password reset on their existing account.
  if (await emailHasAuthUser(email)) {
    return {
      error: `${email} already has a ${BRAND.name} account. Log in or reset your password instead.`,
    }
  }

  // ---- Provision: org → property → auth user → profile, in order.
  // Each step is rolled back if a later one fails so a partial
  // signup doesn't leave dangling rows.
  const { data: existingOrgs } = await admin
    .from('organizations')
    .select('slug')
  const taken = new Set((existingOrgs ?? []).map((o) => o.slug))
  const orgSlug = uniqueSlug(slugify(hotelName) || 'hotel', (s) => taken.has(s))

  const trialStart = new Date()
  const trialEnd = new Date(
    trialStart.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
  )

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      slug: orgSlug,
      name: hotelName,
      trial_started_at: trialStart.toISOString(),
      trial_ends_at: trialEnd.toISOString(),
    })
    .select('id')
    .single()
  if (orgErr || !org) {
    console.error('[signup] org insert failed', orgErr)
    return { error: 'Something went wrong creating your account. Please try again.' }
  }

  const propertySlug = uniqueSlug(
    slugify(hotelName) || 'main',
    () => false, // brand-new org, no existing property slugs
  )
  const { error: propErr } = await admin.from('properties').insert({
    org_id: org.id,
    slug: propertySlug,
    name: hotelName,
    r2_prefix: `${orgSlug}/${propertySlug}/`,
    storage_quota_bytes: TRIAL_STORAGE_BYTES,
  })
  if (propErr) {
    console.error('[signup] property insert failed', propErr)
    await admin.from('organizations').delete().eq('id', org.id)
    return { error: 'Something went wrong creating your account. Please try again.' }
  }

  // email_confirm=true → user can sign in immediately. Email verification
  // is the standard Supabase Auth flow if they reset their password later;
  // we prefer zero-friction PLG over verifying first.
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
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
    full_name: fullName,
  })
  if (profileErr) {
    console.error('[signup] profile upsert failed', profileErr)
    await admin.auth.admin.deleteUser(userId)
    await admin.from('organizations').delete().eq('id', org.id)
    return { error: 'Something went wrong setting up your profile. Please try again.' }
  }

  // Audit trail in the existing signup-requests table — also captures
  // the ToS/Privacy version they agreed to at this moment.
  await admin.from('tenant_signup_requests').insert({
    email,
    full_name: fullName,
    hotel_name: hotelName,
    ip_address: ipAddress,
    status: 'approved',
    approved_org_id: org.id,
    approved_at: new Date().toISOString(),
    agreed_at: new Date().toISOString(),
    agreed_terms_version: TERMS_OF_SERVICE_LAST_UPDATED,
    agreed_privacy_version: PRIVACY_POLICY_LAST_UPDATED,
    email_verified_at: new Date().toISOString(),
  })

  // Welcome email is best-effort — failure does not roll back the signup.
  // The trial works without it, but the email is a useful conversion
  // touchpoint so we attempt it on every signup.
  void sendWelcomeEmail({
    to: email,
    recipientName: fullName,
    orgName: hotelName,
    roleLabel: 'the owner',
    inviterName: null,
  }).catch((err) => {
    console.warn('[signup] welcome email failed', err)
  })

  // Sign the user in via the anon (cookie-bound) client so they land
  // on /dashboard already authenticated.
  const supabase = await createClient()
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (signInErr) {
    // The account exists; route them to /login with a helpful message
    // instead of failing the whole signup.
    console.warn('[signup] auto sign-in failed', signInErr)
    redirect('/login?signed_up=1')
  }

  redirect('/dashboard?welcome=trial')
}

async function emailHasAuthUser(email: string): Promise<boolean> {
  const admin = createAdminClient()
  // listUsers is paginated; the same convention used elsewhere in this
  // codebase assumes <200 users which is plenty for v1.
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
