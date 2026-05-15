'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  VerifyCodeError,
  confirmTotpEnrollment,
  startTotpEnrollment,
  unenrollFactor,
} from '@/lib/auth/mfa'
import { validatePassword } from '@/lib/auth/password'
import { verifyPasswordForEmail } from '@/lib/auth/reauth'
import { requireOrgUser, requireUser } from '@/lib/auth/session'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type ActionResult = { error?: string; success?: string }

const PHONE_MAX = 40
const TITLE_MAX = 120
const BIO_MAX = 600

/**
 * Save the signed-in user's editable profile fields: name, phone, title,
 * bio. Email is handled separately by {@link changeEmailAction} because
 * it requires Supabase's verification round-trip.
 *
 * Length floors mirror the CHECK constraints on the profiles table so a
 * client that bypasses the maxLength attribute still gets a clean error
 * here instead of a 23514 from Postgres.
 */
export async function updateProfileAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireUser()
  const fullName = String(formData.get('full_name') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const bio = String(formData.get('bio') ?? '').trim()

  if (phone.length > PHONE_MAX) {
    return { error: `Phone is too long (${PHONE_MAX} characters max).` }
  }
  if (title.length > TITLE_MAX) {
    return { error: `Title is too long (${TITLE_MAX} characters max).` }
  }
  if (bio.length > BIO_MAX) {
    return { error: `Bio is too long (${BIO_MAX} characters max).` }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName || null,
      phone: phone || null,
      title: title || null,
      bio: bio || null,
    })
    .eq('id', session.userId)
  if (error) return { error: error.message }

  revalidatePath('/account')
  return { success: 'Profile updated.' }
}

/**
 * Initiate an email change. Supabase sends a confirmation link to the
 * NEW address; the change only takes effect when the user clicks it. We
 * surface that explicitly in the success message so the user knows to
 * check their inbox.
 *
 * If the Supabase project has "Secure email change" enabled, BOTH the
 * old and new addresses receive a confirmation link — both must be
 * clicked for the swap to complete. Either way, no app-side write
 * happens here; auth.users is the source of truth for email.
 */
export async function changeEmailAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireUser()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email) return { error: 'Email is required.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Enter a valid email address.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Sign in again.' }
  if (email === user.email) {
    return { error: 'That is already your current email address.' }
  }

  const { error } = await supabase.auth.updateUser({ email })
  if (error) return { error: error.message }

  return {
    success:
      "Check your inbox at the new address to confirm the change. The update won't take effect until you click the link.",
  }
}

/**
 * Change the signed-in user's password from the inline form on /account.
 * Mirrors the validation in /set-password (length + character classes) and
 * confirms the new password matches the confirmation field before calling
 * Supabase. Supabase's own policy is the authoritative server-side floor;
 * if it rejects we surface a generic failure.
 */
export async function changePasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  const check = validatePassword(password)
  if (!check.ok) return { error: check.error }
  if (password !== confirm) return { error: "Passwords don't match." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session has expired. Sign in again.' }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return {
      error:
        "Couldn't save that password. Make sure it meets the requirements and try again.",
    }
  }
  return { success: 'Password updated.' }
}

/**
 * Self-serve account deletion. GDPR / CCPA grant the user the right to
 * delete their personal data on request — this is the in-product path
 * so we don't have to handle every request manually via email.
 *
 * Behaviour by role:
 *
 *   - org_owner    → cancels Stripe subscription, deletes the entire org
 *                    (cascades to properties + tenant content), deletes
 *                    every team member's auth user, signs out, redirects
 *                    home. The owner's decision to delete terminates
 *                    everyone they invited; the confirm copy on the UI
 *                    spells that out.
 *   - org_staff    → detaches their profile from the org and deletes
 *                    their auth user. The org and its data are unaffected.
 *   - platform_admin → blocked. Use the bootstrap script or another admin
 *                    to remove a platform admin; self-deletion of the
 *                    last admin would lock everyone out of /admin.
 *
 * Confirmation token: the form posts a `confirmation` field that must
 * equal the expected value (org slug for owner, "DELETE" for staff).
 * Any mismatch silently returns — the user has to type it deliberately.
 */
export async function deleteMyAccountAction(formData: FormData) {
  const session = await requireOrgUser()
  const confirmation = String(formData.get('confirmation') ?? '').trim()

  if (session.profile.role === 'platform_admin') {
    // Belt: requireOrgUser already redirects platform admins to /admin
    // (no org_id), but if a platform admin somehow has an org_id this
    // refuses the self-deletion.
    return
  }

  const admin = createAdminClient()

  if (session.profile.role === 'org_owner') {
    // Owner must type the org slug to confirm — same convention as the
    // admin-side delete-tenant flow.
    if (confirmation !== session.organization.slug) return

    // Cancel every property's Stripe subscription (best-effort — keep
    // deleting even if Stripe fails so we honor the user's deletion
    // request). One subscription per property under the same Customer.
    const { data: subs } = await admin
      .from('billing_subscriptions')
      .select('stripe_subscription_id')
      .eq('org_id', session.organization.id)
    for (const s of subs ?? []) {
      if (!s.stripe_subscription_id) continue
      try {
        await stripe().subscriptions.cancel(s.stripe_subscription_id, {
          invoice_now: false,
          prorate: false,
        })
      } catch (err) {
        console.warn(
          '[account] stripe cancel failed during account deletion',
          err,
        )
      }
    }

    // Collect every auth user attached to the org so we can delete
    // them after the org row goes (cascade on profiles sets org_id null
    // rather than removing the auth.users record).
    const { data: profiles } = await admin
      .from('profiles')
      .select('id')
      .eq('org_id', session.organization.id)
    const userIdsToDelete = (profiles ?? []).map((p) => p.id)

    // Delete the org. FK cascade removes properties, billing subscription,
    // events, etc. profiles.org_id goes null per the existing schema.
    await admin.from('organizations').delete().eq('id', session.organization.id)

    // Now delete the auth users (which removes profiles via cascade).
    for (const userId of userIdsToDelete) {
      try {
        await admin.auth.admin.deleteUser(userId)
      } catch (err) {
        console.warn('[account] auth.admin.deleteUser failed', err)
      }
    }
  } else {
    // org_staff: detach the profile and delete the auth user. Org +
    // org-owned data stays.
    if (confirmation !== 'DELETE') return
    try {
      await admin.auth.admin.deleteUser(session.userId)
    } catch (err) {
      console.error('[account] auth.admin.deleteUser failed', err)
    }
  }

  redirect('/')
}

/**
 * Less destructive companion: download every personal-data row tied to
 * the caller's profile + org so they can satisfy a "data portability"
 * request without contacting support. Returns JSON the client streams
 * as a download. Stub for now — wire to a button on /account when
 * needed; the in-product list is already legally sufficient for
 * launch-day if they email instead.
 */
export async function requestDataExport(): Promise<void> {
  await requireUser()
  // Intentional no-op; see comment above.
}

// ---------------------------------------------------------------------------
// Multi-factor authentication (optional TOTP)
// ---------------------------------------------------------------------------

export type StartMfaEnrollmentResult = {
  error?: string
  factorId?: string
  qrPngDataUri?: string
  secret?: string
  otpAuthUri?: string
}

/**
 * Begin a TOTP enrollment for the signed-in user. Returns the QR /
 * secret the user pairs with their authenticator app. The factor is
 * created in `unverified` state — it doesn't gate login until
 * confirmed via {@link confirmMfaEnrollmentAction} below.
 */
export async function startMfaEnrollmentAction(
  _prev: StartMfaEnrollmentResult,
  _formData: FormData,
): Promise<StartMfaEnrollmentResult> {
  const session = await requireUser()
  try {
    const result = await startTotpEnrollment(
      session.profile.full_name?.trim() || session.email,
    )
    return result
  } catch (err) {
    console.error('[mfa] start enrollment failed', err)
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Could not start two-factor setup.',
    }
  }
}

/**
 * Confirm an in-flight TOTP enrollment by submitting a code from the
 * authenticator. Marks the factor verified — future sign-ins require
 * a TOTP challenge.
 */
export async function confirmMfaEnrollmentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireUser()
  const factorId = String(formData.get('factor_id') ?? '').trim()
  const code = String(formData.get('code') ?? '').trim()
  if (!factorId) return { error: 'Missing factor — start over.' }
  if (!/^\d{6}$/.test(code)) {
    return { error: 'Enter the 6-digit code from your authenticator app.' }
  }
  try {
    await confirmTotpEnrollment(factorId, code)
  } catch (err) {
    if (err instanceof VerifyCodeError) {
      return { error: 'That code didn’t match. Try the next one your app shows.' }
    }
    console.error('[mfa] confirm enrollment failed', err)
    return {
      error: err instanceof Error ? err.message : 'Could not verify the code.',
    }
  }
  revalidatePath('/account')
  return { success: 'Two-factor authentication is now active on your account.' }
}

/**
 * Remove a TOTP factor. Requires the user to re-enter their current
 * password — disabling MFA is a security-sensitive action and we
 * don't want a brief unattended-laptop window to be enough to strip
 * the second factor off the account.
 *
 * Re-auth uses {@link verifyPasswordForEmail} (a throwaway Supabase
 * client) so the user's existing aal2 session is preserved through
 * the check; only after the password matches do we call
 * {@link unenrollFactor}. When the unenrolled factor is the only
 * one the account has, MFA is fully off and future sign-ins skip
 * the challenge step.
 */
export async function unenrollMfaAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireUser()
  const factorId = String(formData.get('factor_id') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (!factorId) return { error: 'Missing factor id.' }
  if (!password) {
    return { error: 'Enter your current password to disable two-factor authentication.' }
  }

  const ok = await verifyPasswordForEmail(session.email, password).catch(
    (err) => {
      console.error('[mfa] reauth check threw', err)
      return false
    },
  )
  if (!ok) {
    return { error: 'That password is not correct.' }
  }

  try {
    await unenrollFactor(factorId)
  } catch (err) {
    console.error('[mfa] unenroll failed', err)
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Could not remove two-factor authentication.',
    }
  }
  revalidatePath('/account')
  return { success: 'Two-factor authentication has been turned off.' }
}
