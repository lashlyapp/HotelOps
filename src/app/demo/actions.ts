'use server'

import { headers } from 'next/headers'
import { BRAND } from '@/lib/brand'
import {
  sendDemoBookingConfirmation,
  sendDemoBookingNotification,
} from '@/lib/email/send'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'
import { interpolate } from '@/lib/i18n/interpolate'
import { parseSlotId } from '@/lib/marketing/demo-slots'
import { createAdminClient } from '@/lib/supabase/admin'

export type BookingActionResult = {
  error?: string
  success?: { email: string }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Light rate limit reuses the tenant_signup_requests table — same
// IP+15min window the signup form uses. Acceptable cross-use because
// the table already exists for the same purpose (per-IP throttling
// of unauthed form submissions); a dedicated table would be
// over-engineering for v1.
const RATE_WINDOW_MINUTES = 15
const RATE_LIMIT_PER_IP = 8

/**
 * Process a /demo booking form submission. Validates the slot is
 * one we offered, sends a notification email to the operator, fires
 * a confirmation back to the visitor, and returns a success result
 * the form renders inline.
 *
 * No DB write yet — the booking lives in the email thread until
 * the operator either accepts (sends a Calendar invite) or
 * proposes a different time. If demo volume scales, swap this for
 * a real slot-reservation table that prevents double-booking
 * server-side.
 */
export async function bookDemoSlot(
  _prev: BookingActionResult,
  formData: FormData,
): Promise<BookingActionResult> {
  const locale = await getLocale()
  const e = getDictionary(locale).demo.booking

  const slotId = String(formData.get('slot_id') ?? '').trim()
  const visitorName = String(formData.get('name') ?? '').trim()
  const visitorEmail = String(formData.get('email') ?? '').trim().toLowerCase()
  const hotelName = String(formData.get('hotel_name') ?? '').trim()
  const propertyCount = String(formData.get('property_count') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!slotId || !visitorName || !visitorEmail || !hotelName) {
    return { error: e.errorMissing }
  }
  if (!EMAIL_RE.test(visitorEmail)) {
    return { error: e.errorEmail }
  }
  const parsed = parseSlotId(slotId)
  if (!parsed) {
    return { error: e.errorSlot }
  }
  if (visitorName.length > 200 || hotelName.length > 200) {
    return { error: e.errorMissing }
  }
  if (notes && notes.length > 2000) {
    return { error: e.errorMissing }
  }

  // Per-IP rate limit. Booking the same slot many times from one
  // IP would either be a bot or an over-eager prospect — either
  // way we want to cap it.
  const ipAddress = await getClientIp()
  const admin = createAdminClient()
  if (ipAddress) {
    const since = new Date(
      Date.now() - RATE_WINDOW_MINUTES * 60 * 1000,
    ).toISOString()
    const { count } = await admin
      .from('tenant_signup_requests')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ipAddress)
      .gte('created_at', since)
    if ((count ?? 0) >= RATE_LIMIT_PER_IP) {
      return {
        error: interpolate(e.errorGeneric, { email: BRAND.supportEmail }),
      }
    }
  }

  const notified = await sendDemoBookingNotification({
    to: BRAND.supportEmail,
    visitorName,
    visitorEmail,
    hotelName,
    propertyCount,
    notes,
    slotHumanLabel: parsed.humanLabel,
    visitorLocale: locale,
  }).catch((err) => {
    console.error('[demo] notification email failed', err)
    return false
  })

  if (!notified) {
    return {
      error: interpolate(e.errorGeneric, { email: BRAND.supportEmail }),
    }
  }

  // Confirmation back to the visitor — best-effort, don't block on it.
  void sendDemoBookingConfirmation({
    to: visitorEmail,
    visitorName,
    hotelName,
    slotHumanLabel: parsed.humanLabel,
  }).catch((err) => {
    console.warn('[demo] visitor confirmation email failed', err)
  })

  return { success: { email: visitorEmail } }
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
