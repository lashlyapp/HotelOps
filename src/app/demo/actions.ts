'use server'

import { headers } from 'next/headers'
import {
  generateOtp,
  hashOtp,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_RESENDS,
  OTP_TTL_MINUTES,
} from '@/lib/auth/otp'
import { BRAND } from '@/lib/brand'
import {
  sendDemoBookingConfirmation,
  sendDemoBookingNotification,
  sendDemoBookingOtpEmail,
} from '@/lib/email/send'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'
import { interpolate } from '@/lib/i18n/interpolate'
import { isSlotWithinLeadTime, parseSlotId } from '@/lib/marketing/demo-slots'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Two-step booking flow:
 *
 *   1. requestDemoBookingOtp — visitor submits the form; we persist
 *      the booking intent in demo_bookings_pending with an OTP
 *      hash and email the visitor a 6-digit code. Returns
 *      `{ otpSent: { email } }` so the client switches to the
 *      verification step.
 *
 *   2. verifyDemoBookingOtp — visitor enters the code; we hash and
 *      compare, increment attempts on miss, finalize on hit. On
 *      success the founder notification + visitor confirmation
 *      emails fire and the pending row is deleted.
 *
 *   3. resendDemoBookingOtp — generates a fresh code, updates the
 *      pending row, sends a new email. Throttled by
 *      resends + resent_at on the row.
 */

export type BookingActionResult = {
  error?: string
  /** Set when the OTP email has been sent and the form should
   *  transition to the verification step. The slot/day labels are
   *  echoed back so the verification screen can show them. */
  otpSent?: {
    email: string
    slotHumanLabel: string
  }
  /** Set when a resend just succeeded; the UI shows a transient
   *  "a new code is on its way" hint. */
  resent?: boolean
  /** Set when verification completed; the UI swaps to a success
   *  block. */
  success?: { email: string }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ALLOWED_LANGUAGES = new Set(['en', 'es', 'ko', 'vi'])

const RATE_WINDOW_MINUTES = 15
const RATE_LIMIT_PER_IP = 8
const RESEND_COOLDOWN_SECONDS = 30

// ---------------------------------------------------------------------------
// Step 1 — request OTP
// ---------------------------------------------------------------------------
export async function requestDemoBookingOtp(
  _prev: BookingActionResult,
  formData: FormData,
): Promise<BookingActionResult> {
  const locale = await getLocale()
  const dict = getDictionary(locale).demo
  const e = dict.booking

  const slotId = String(formData.get('slot_id') ?? '').trim()
  const visitorName = String(formData.get('name') ?? '').trim()
  const visitorEmail = String(formData.get('email') ?? '').trim().toLowerCase()
  const hotelName = String(formData.get('hotel_name') ?? '').trim()
  const propertyCount = String(formData.get('property_count') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null
  const preferredLanguage = String(formData.get('preferred_language') ?? '').trim()

  if (!slotId || !visitorName || !visitorEmail || !hotelName) {
    return { error: e.errorMissing }
  }
  if (!EMAIL_RE.test(visitorEmail)) {
    return { error: e.errorEmail }
  }
  if (!ALLOWED_LANGUAGES.has(preferredLanguage)) {
    return { error: e.errorLanguage }
  }
  const parsed = parseSlotId(slotId)
  if (!parsed) {
    return { error: e.errorSlot }
  }
  if (!isSlotWithinLeadTime(parsed.date)) {
    return { error: e.errorSlot }
  }
  if (visitorName.length > 200 || hotelName.length > 200) {
    return { error: e.errorMissing }
  }
  if (notes && notes.length > 2000) {
    return { error: e.errorMissing }
  }

  const ipAddress = await getClientIp()
  const admin = createAdminClient()

  // Per-IP rate limit using the same window as signup (reusing
  // tenant_signup_requests would conflate flows; demo_bookings_pending
  // doesn't have its own rate-limit table so we lean on insert/
  // upsert volume itself — a single IP getting 8 OTPs in 15 min is
  // already throttled by the unique(email) constraint plus this
  // count check).
  const since = new Date(
    Date.now() - RATE_WINDOW_MINUTES * 60 * 1000,
  ).toISOString()
  if (ipAddress) {
    const { count } = await admin
      .from('demo_bookings_pending')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ipAddress)
      .gte('created_at', since)
    if ((count ?? 0) >= RATE_LIMIT_PER_IP) {
      return {
        error: interpolate(e.errorGeneric, { email: BRAND.supportEmail }),
      }
    }
  }

  const code = generateOtp()
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)

  // Upsert so a visitor retrying with the same email starts a
  // fresh attempts/resends counter rather than failing on the
  // unique constraint.
  const { error: upsertErr } = await admin
    .from('demo_bookings_pending')
    .upsert(
      {
        email: visitorEmail,
        visitor_name: visitorName,
        hotel_name: hotelName,
        property_count: propertyCount,
        notes,
        slot_id: slotId,
        preferred_language: preferredLanguage,
        visitor_locale: locale,
        otp_hash: hashOtp(code),
        attempts: 0,
        resends: 0,
        resent_at: null,
        expires_at: expiresAt.toISOString(),
        ip_address: ipAddress,
      },
      { onConflict: 'email' },
    )

  if (upsertErr) {
    console.error('[demo] pending upsert failed', upsertErr)
    return {
      error: interpolate(e.errorGeneric, { email: BRAND.supportEmail }),
    }
  }

  const sent = await sendDemoBookingOtpEmail({
    to: visitorEmail,
    visitorName,
    hotelName,
    slotHumanLabel: parsed.humanLabel,
    code,
    ttlMinutes: OTP_TTL_MINUTES,
  }).catch((err) => {
    console.error('[demo] OTP email failed', err)
    return false
  })

  if (!sent) {
    return {
      error: interpolate(e.errorGeneric, { email: BRAND.supportEmail }),
    }
  }

  return {
    otpSent: { email: visitorEmail, slotHumanLabel: parsed.humanLabel },
  }
}

// ---------------------------------------------------------------------------
// Step 2 — verify OTP, finalize booking
// ---------------------------------------------------------------------------
export async function verifyDemoBookingOtp(
  _prev: BookingActionResult,
  formData: FormData,
): Promise<BookingActionResult> {
  const locale = await getLocale()
  const t = getDictionary(locale).demo.otp
  const e = t.errors

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const codeRaw = String(formData.get('code') ?? '').trim()

  if (!email || !EMAIL_RE.test(email)) {
    return { error: getDictionary(locale).demo.booking.errorEmail }
  }
  if (!codeRaw) {
    return { error: e.codeRequired }
  }
  if (codeRaw.length !== OTP_LENGTH || !/^\d+$/.test(codeRaw)) {
    return { error: interpolate(e.codeLength, { n: OTP_LENGTH }) }
  }

  const admin = createAdminClient()
  const { data: pending, error: fetchErr } = await admin
    .from('demo_bookings_pending')
    .select('*')
    .eq('email', email)
    .maybeSingle()

  if (fetchErr) {
    console.error('[demo] pending fetch failed', fetchErr)
    return { error: e.noPending }
  }
  if (!pending) return { error: e.noPending }

  if (new Date(pending.expires_at).getTime() < Date.now()) {
    await admin.from('demo_bookings_pending').delete().eq('email', email)
    return { error: e.codeExpired }
  }

  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    await admin.from('demo_bookings_pending').delete().eq('email', email)
    return { error: e.codeTooManyAttempts }
  }

  if (hashOtp(codeRaw) !== pending.otp_hash) {
    const nextAttempts = pending.attempts + 1
    await admin
      .from('demo_bookings_pending')
      .update({ attempts: nextAttempts })
      .eq('email', email)
    const left = Math.max(0, OTP_MAX_ATTEMPTS - nextAttempts)
    if (left === 0) {
      await admin.from('demo_bookings_pending').delete().eq('email', email)
      return { error: e.codeMismatchFinal }
    }
    if (left === 1) return { error: e.codeMismatchOne }
    return { error: interpolate(e.codeMismatchMany, { n: left }) }
  }

  // Verified. Persist the appointment, fire notification +
  // confirmation emails, then delete the pending row.
  const parsed = parseSlotId(pending.slot_id)
  const slotHumanLabel = parsed?.humanLabel ?? pending.slot_id

  // Persist to demo_appointments so the admin UI has a row to
  // show. We do this BEFORE the notification email so a successful
  // verify always leaves a queryable record even if Resend is down
  // — the founder might miss the email but won't lose the booking.
  // slot_at falls back to "now" if parseSlotId failed, which
  // shouldn't happen but keeps the insert from silently dropping.
  const { error: appointmentErr } = await admin
    .from('demo_appointments')
    .insert({
      visitor_email: pending.email,
      visitor_name: pending.visitor_name,
      hotel_name: pending.hotel_name,
      property_count: pending.property_count,
      visitor_notes: pending.notes,
      preferred_language: pending.preferred_language,
      visitor_locale: pending.visitor_locale,
      slot_id: pending.slot_id,
      slot_at: (parsed?.at ?? new Date()).toISOString(),
      status: 'scheduled',
    })
  if (appointmentErr) {
    console.error('[demo] appointment insert failed', appointmentErr)
    // Continue anyway — losing the appointment row is worse than
    // continuing without it, since the email still gets through.
  }

  const notified = await sendDemoBookingNotification({
    to: BRAND.supportEmail,
    visitorName: pending.visitor_name,
    visitorEmail: pending.email,
    hotelName: pending.hotel_name,
    propertyCount: pending.property_count,
    notes: pending.notes
      ? `Language preference: ${labelForLanguage(pending.preferred_language)}\n\n${pending.notes}`
      : `Language preference: ${labelForLanguage(pending.preferred_language)}`,
    slotHumanLabel,
    visitorLocale: pending.visitor_locale,
  }).catch((err) => {
    console.error('[demo] notification email failed', err)
    return false
  })

  if (!notified) {
    return {
      error: interpolate(getDictionary(locale).demo.booking.errorGeneric, {
        email: BRAND.supportEmail,
      }),
    }
  }

  void sendDemoBookingConfirmation({
    to: pending.email,
    visitorName: pending.visitor_name,
    hotelName: pending.hotel_name,
    slotHumanLabel,
  }).catch((err) => {
    console.warn('[demo] visitor confirmation email failed', err)
  })

  await admin.from('demo_bookings_pending').delete().eq('email', email)

  return { success: { email: pending.email } }
}

// ---------------------------------------------------------------------------
// Step 3 — resend OTP
// ---------------------------------------------------------------------------
export async function resendDemoBookingOtp(
  _prev: BookingActionResult,
  formData: FormData,
): Promise<BookingActionResult> {
  const locale = await getLocale()
  const t = getDictionary(locale).demo.otp
  const e = t.errors

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) {
    return { error: getDictionary(locale).demo.booking.errorEmail }
  }

  const admin = createAdminClient()
  const { data: pending } = await admin
    .from('demo_bookings_pending')
    .select('*')
    .eq('email', email)
    .maybeSingle()

  if (!pending) return { error: e.noPending }

  if (pending.resends >= OTP_MAX_RESENDS) {
    return { error: e.tooManyResends }
  }
  if (pending.resent_at) {
    const since = (Date.now() - new Date(pending.resent_at).getTime()) / 1000
    if (since < RESEND_COOLDOWN_SECONDS) return { error: e.resendCooldown }
  }

  const code = generateOtp()
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)

  await admin
    .from('demo_bookings_pending')
    .update({
      otp_hash: hashOtp(code),
      attempts: 0,
      resends: pending.resends + 1,
      resent_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq('email', email)

  const parsed = parseSlotId(pending.slot_id)
  const sent = await sendDemoBookingOtpEmail({
    to: pending.email,
    visitorName: pending.visitor_name,
    hotelName: pending.hotel_name,
    slotHumanLabel: parsed?.humanLabel ?? pending.slot_id,
    code,
    ttlMinutes: OTP_TTL_MINUTES,
  }).catch(() => false)

  if (!sent) {
    return {
      error: interpolate(getDictionary(locale).demo.booking.errorGeneric, {
        email: BRAND.supportEmail,
      }),
    }
  }

  return { resent: true }
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

/** Render the preferred-language code as a human label embedded in
 *  the founder's notification email body. Kept English-only — the
 *  founder reads this. */
function labelForLanguage(code: string): string {
  switch (code) {
    case 'en':
      return 'English'
    case 'es':
      return 'Español (Spanish)'
    case 'ko':
      return '한국어 (Korean)'
    case 'vi':
      return 'Tiếng Việt (Vietnamese)'
    default:
      return code
  }
}
