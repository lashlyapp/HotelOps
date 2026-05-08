import 'server-only'
import { Resend } from 'resend'

let cached: Resend | null = null

/**
 * Returns a Resend client if RESEND_API_KEY is set, otherwise null.
 * Callers should treat null as "email is disabled" — log + skip, don't fail.
 */
export function getResend(): Resend | null {
  if (cached) return cached
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  cached = new Resend(key)
  return cached
}

export function getEmailFrom(): string {
  return process.env.EMAIL_FROM ?? 'MyHotelOps <onboarding@resend.dev>'
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}
