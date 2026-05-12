/**
 * Password policy.
 *
 * The authoritative server-side floor lives in the Supabase Auth dashboard
 * (Authentication → Policies → Password requirements). This module
 * MIRRORS that policy in the app layer so we can:
 *
 *   1. Give the user immediate feedback before round-tripping to Supabase
 *      (and a hint that explains the rules up-front instead of after the
 *      fact).
 *   2. Enforce the same rules on the admin-set paths in lib/admin/actions
 *      that use the service-role client — Supabase's policy applies to
 *      `supabase.auth.{signUp, updateUser}` but is bypassed by
 *      `supabase.auth.admin.{createUser, updateUserById}` (service role
 *      is trusted by design). We re-enforce here so admin-set passwords
 *      meet the same floor.
 *   3. Generate a policy-compliant default for the "I'll set a temporary
 *      password" admin flow without the admin having to invent one.
 *
 * Keep these constants in sync with the Supabase Dashboard:
 *   Min length:           8
 *   Required characters:  Lowercase, Uppercase, Digits
 *   (Symbols not required — modern NIST guidance discourages forced
 *    composition beyond a reasonable floor.)
 */

export const MIN_PASSWORD_LENGTH = 8

const RULES = [
  { test: /[a-z]/, label: 'one lowercase letter' },
  { test: /[A-Z]/, label: 'one uppercase letter' },
  { test: /[0-9]/, label: 'one number' },
] as const

export const PASSWORD_REQUIREMENTS_HINT =
  `At least ${MIN_PASSWORD_LENGTH} characters, with at least one ` +
  `lowercase letter, one uppercase letter, and one number.`

export type PasswordValidationResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Validate a password against the policy. Returns the first failing rule
 * as a human-readable message so call sites can surface it as-is.
 */
export function validatePassword(password: string): PasswordValidationResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    }
  }
  const missing = RULES.filter((r) => !r.test.test(password))
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Password must include at least ${missing.map((m) => m.label).join(', ')}.`,
    }
  }
  return { ok: true }
}

/**
 * Generate a password that satisfies the policy. Used by the admin
 * "set a temporary password" flow as a default suggestion so the admin
 * doesn't have to think one up, and the result is guaranteed to clear
 * the validator. Length 16 = plenty of entropy without being unwieldy
 * to type once before the recipient changes it.
 */
export function generatePassword(length = 16): string {
  if (length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `generatePassword length must be >= ${MIN_PASSWORD_LENGTH}`,
    )
  }
  const lowers = 'abcdefghijkmnopqrstuvwxyz' // no l (confusable with 1)
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I, O
  const digits = '23456789' // no 0, 1
  const all = lowers + uppers + digits

  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  const out = Array.from(bytes, (b) => all[b % all.length])

  // Guarantee each rule is satisfied even on unlucky draws.
  const seedBytes = new Uint8Array(3)
  crypto.getRandomValues(seedBytes)
  out[seedBytes[0] % length] = lowers[seedBytes[0] % lowers.length]
  out[seedBytes[1] % length] = uppers[seedBytes[1] % uppers.length]
  out[seedBytes[2] % length] = digits[seedBytes[2] % digits.length]
  return out.join('')
}
