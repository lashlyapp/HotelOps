'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { PRIVACY_POLICY_LAST_UPDATED } from '@/app/privacy/page'
import { TERMS_OF_SERVICE_LAST_UPDATED } from '@/app/terms/page'
import { BRAND } from '@/lib/brand'
import {
  sendSignupNotification,
  sendSignupVerificationEmail,
} from '@/lib/email/send'
import { createAdminClient } from '@/lib/supabase/admin'

export type SignupActionResult = { error?: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Rate limits. The window is short and the cap is generous enough not to
// trip a legitimate group of hotels signing up from the same office, but
// strict enough that an attacker can't flood the table or spam a victim's
// inbox with verification emails.
const RATE_WINDOW_MINUTES = 15
const RATE_LIMIT_PER_IP = 5
const RATE_LIMIT_PER_EMAIL = 2

export async function submitSignupRequest(
  _prev: SignupActionResult,
  formData: FormData,
): Promise<SignupActionResult> {
  // Honeypot: bots fill every field, real users don't see this one
  // (it's hidden in the form). Silently 200 if it's set so the bot
  // thinks it succeeded and stops retrying.
  const honeypot = String(formData.get('website') ?? '')
  if (honeypot.trim()) {
    redirect('/signup/thanks')
  }

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const fullName = String(formData.get('full_name') ?? '').trim()
  const hotelName = String(formData.get('hotel_name') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim() || null
  const message = String(formData.get('message') ?? '').trim() || null
  const consent = formData.get('consent') === 'yes'

  if (!email || !fullName || !hotelName) {
    return { error: 'Email, your name, and hotel name are required.' }
  }
  if (!EMAIL_RE.test(email)) {
    return { error: 'Please enter a valid email address.' }
  }
  if (fullName.length > 200 || hotelName.length > 200) {
    return { error: 'That looks too long — keep names under 200 characters.' }
  }
  if (message && message.length > 2000) {
    return { error: 'Please keep your message under 2,000 characters.' }
  }
  if (!consent) {
    return {
      error: 'Please agree to the Terms of Service and Privacy Policy to continue.',
    }
  }

  const ipAddress = await getClientIp()

  // Rate limits. We use the service-role client because the public
  // anon client can't see rows it didn't insert (RLS), and the count
  // here needs to span all submissions.
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
      error: `We’ve already received recent signups for ${email}. Check your inbox for a verification email, or try again later.`,
    }
  }

  // Generate a high-entropy verification token. The row stays invisible
  // to admins until the prospect clicks the link in the email we send.
  const token = generateUrlSafeToken(32)
  const verifyUrl = `${getSiteUrl()}/signup/verify?token=${encodeURIComponent(token)}`

  // Anon client respects the RLS policy (status='pending' on insert).
  // We can't write ip_address / email_verification_token via the anon
  // client because they're not in the policy's WITH CHECK — so use
  // the service-role admin client to do the insert.
  const { error } = await admin.from('tenant_signup_requests').insert({
    email,
    full_name: fullName,
    hotel_name: hotelName,
    phone,
    message,
    ip_address: ipAddress,
    email_verification_token: token,
    email_verification_sent_at: new Date().toISOString(),
    agreed_at: new Date().toISOString(),
    agreed_terms_version: TERMS_OF_SERVICE_LAST_UPDATED,
    agreed_privacy_version: PRIVACY_POLICY_LAST_UPDATED,
  })
  if (error) {
    console.error('[signup] insert failed', error)
    return {
      error:
        'Something went wrong saving your request. Please email ' +
        BRAND.supportEmail +
        ' and we’ll follow up directly.',
    }
  }

  // Send the verification email. If email isn't configured we still
  // succeed — the row is auto-marked verified during dev so the admin
  // notification still goes out, but in production this branch should
  // never hit.
  const verifSent = await sendSignupVerificationEmail({
    to: email,
    recipientName: fullName,
    hotelName,
    verifyUrl,
  }).catch((err) => {
    console.warn('[signup] verification email failed', err)
    return false
  })
  if (!verifSent) {
    // Dev fallback: no email configured → auto-verify and notify admin
    // immediately so the local /admin flow still works end-to-end.
    await admin
      .from('tenant_signup_requests')
      .update({
        email_verified_at: new Date().toISOString(),
        email_verification_token: null,
      })
      .eq('email_verification_token', token)
    try {
      await sendSignupNotification({
        email,
        fullName,
        hotelName,
        phone,
        message,
      })
    } catch (err) {
      console.warn('[signup] admin notification failed', err)
    }
  }

  redirect('/signup/thanks')
}

/**
 * Mark a signup row's email as verified and dispatch the admin
 * notification. Called by the GET /signup/verify route handler when
 * the user clicks the link in their email.
 *
 * Returns true on first successful verification, false if the token
 * is unknown / already used / expired.
 */
export async function verifySignupEmail(token: string): Promise<boolean> {
  if (!token || token.length < 16) return false
  const admin = createAdminClient()

  const { data: row } = await admin
    .from('tenant_signup_requests')
    .select('*')
    .eq('email_verification_token', token)
    .maybeSingle()
  if (!row) return false
  if (row.email_verified_at) return true // already verified; idempotent

  // 24 hour expiry on the verification link.
  const sentAt = row.email_verification_sent_at
    ? new Date(row.email_verification_sent_at).getTime()
    : 0
  if (Date.now() - sentAt > 24 * 60 * 60 * 1000) return false

  await admin
    .from('tenant_signup_requests')
    .update({
      email_verified_at: new Date().toISOString(),
      email_verification_token: null,
    })
    .eq('id', row.id)

  // Now that the email is confirmed, ping the platform admin so they
  // can review on /admin.
  try {
    await sendSignupNotification({
      email: row.email,
      fullName: row.full_name,
      hotelName: row.hotel_name,
      phone: row.phone,
      message: row.message,
    })
  } catch (err) {
    console.warn('[signup] admin notification (post-verify) failed', err)
  }

  return true
}

async function getClientIp(): Promise<string | null> {
  // Vercel / Cloudflare both set x-forwarded-for with the client IP
  // as the first comma-separated entry. Trust the first hop only.
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const real = h.get('x-real-ip')
  return real ?? null
}

function getSiteUrl(): string {
  // For verification-email links we want the canonical site URL (the
  // recipient may open the email on a different device/browser from the
  // one they used to submit the form, so request origin isn't reliable).
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '')
}

function generateUrlSafeToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}
