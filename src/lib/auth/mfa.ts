import 'server-only'
import QRCode from 'qrcode'
import { BRAND } from '@/lib/brand'
import { createClient } from '@/lib/supabase/server'

/**
 * Optional TOTP-based multi-factor authentication on top of password
 * sign-in. The flow leans entirely on Supabase Auth's MFA primitives:
 * the factors live in `auth.mfa_factors`, the AAL (authenticator
 * assurance level) escalates from aal1 → aal2 once a TOTP code is
 * verified, and protected routes refuse aal1 sessions whenever the
 * user has a verified factor on file.
 *
 * Each helper here is a thin wrapper around the user-scoped anon
 * client (cookie-bound). The service-role client cannot be used —
 * MFA APIs are scoped to "the calling user" by design.
 */

export type EnrolledFactor = {
  id: string
  friendlyName: string | null
  createdAt: string
}

export type StartEnrollmentResult = {
  factorId: string
  /** otpauth:// URI — useful if the user wants to copy/paste into
   *  their authenticator. We surface it alongside the QR in case the
   *  QR scanner is fussy on the device. */
  otpAuthUri: string
  /** Base32 shared secret. Authenticator apps ingest either this or
   *  the QR; we render both. */
  secret: string
  /** Pre-rendered PNG data-URI so the client doesn't have to ship
   *  qrcode.js. ~2 KB; well within reasonable form payload. */
  qrPngDataUri: string
}

/**
 * Start a TOTP enrollment. Creates an *unverified* factor on the user's
 * record — they must call {@link confirmTotpEnrollment} with a code
 * within a few minutes to mark it verified. Unverified factors do not
 * gate login.
 */
export async function startTotpEnrollment(
  friendlyName: string,
): Promise<StartEnrollmentResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: friendlyName.slice(0, 64),
    // Issuer is the label authenticator apps surface alongside the
    // account name; keeping it short and brand-consistent makes the
    // entry recognizable in 1Password / Authy.
    issuer: BRAND.name,
  })
  if (error || !data) {
    throw new Error(error?.message ?? 'Could not start MFA enrollment.')
  }

  // Supabase returns the QR as an SVG string. For our form we render
  // a PNG data URI instead — easier for the browser to lay out, and
  // it survives copy-paste into password managers that strip SVG.
  const qrPngDataUri = await QRCode.toDataURL(data.totp.uri, {
    margin: 1,
    width: 240,
    errorCorrectionLevel: 'M',
  })

  return {
    factorId: data.id,
    otpAuthUri: data.totp.uri,
    secret: data.totp.secret,
    qrPngDataUri,
  }
}

/**
 * Verify a TOTP code against the in-flight unverified factor. On
 * success the factor flips to "verified" and from this point onward
 * any new sign-in from this user is gated by the MFA challenge.
 *
 * Returns true on success. Throws on hard errors so the caller can
 * surface a clean message; wrong-code is a soft failure represented
 * by a thrown VerifyError so the action layer can distinguish.
 */
export async function confirmTotpEnrollment(
  factorId: string,
  code: string,
): Promise<boolean> {
  const supabase = await createClient()
  const { data: challenge, error: challengeErr } =
    await supabase.auth.mfa.challenge({ factorId })
  if (challengeErr || !challenge) {
    throw new Error(challengeErr?.message ?? 'Could not start MFA challenge.')
  }
  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  })
  if (verifyErr) {
    // Wrong code → message reads "Invalid TOTP code entered". Pass it
    // through but in a typed wrapper so the action distinguishes
    // user error from infra failures.
    throw new VerifyCodeError(verifyErr.message)
  }
  return true
}

/**
 * Soft-failure thrown by {@link confirmTotpEnrollment} and the login
 * challenge step when the user mistypes a TOTP code. Lets callers
 * branch on `err instanceof VerifyCodeError` without parsing
 * message strings.
 */
export class VerifyCodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VerifyCodeError'
  }
}

/** Verified factors for the current user. */
export async function listVerifiedFactors(): Promise<EnrolledFactor[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw new Error(error.message)
  return (data?.all ?? [])
    .filter((f) => f.status === 'verified')
    .map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      createdAt: f.created_at,
    }))
}

/** Remove a factor. Strips MFA from the account if it's the only one. */
export async function unenrollFactor(factorId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw new Error(error.message)
}

/**
 * AAL gate used by both /login (post-password-redirect) and
 * requireUser. When the user has a verified factor but their session
 * hasn't satisfied it yet (currentLevel='aal1', nextLevel='aal2'),
 * they must complete the challenge before reaching the rest of the
 * app.
 */
export async function needsMfaChallenge(): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) return false
  return data.currentLevel === 'aal1' && data.nextLevel === 'aal2'
}

/**
 * First verified factor for the current user, or null. The login
 * challenge step picks this one to challenge against — we only
 * support a single factor in the UI so there's no factor-picker
 * complexity to deal with.
 */
export async function getPrimaryVerifiedFactorId(): Promise<string | null> {
  const factors = await listVerifiedFactors()
  return factors[0]?.id ?? null
}

/**
 * Verify a TOTP code at sign-in time. Distinct from
 * {@link confirmTotpEnrollment} only in that it operates against an
 * already-verified factor.
 */
export async function verifyLoginChallenge(
  factorId: string,
  code: string,
): Promise<void> {
  const supabase = await createClient()
  const { data: challenge, error: challengeErr } =
    await supabase.auth.mfa.challenge({ factorId })
  if (challengeErr || !challenge) {
    throw new Error(challengeErr?.message ?? 'Could not start MFA challenge.')
  }
  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  })
  if (verifyErr) throw new VerifyCodeError(verifyErr.message)
}
