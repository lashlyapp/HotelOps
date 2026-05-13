'use server'

import { redirect } from 'next/navigation'
import { validatePassword } from '@/lib/auth/password'
import { requireOrgUser, requireUser } from '@/lib/auth/session'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type ActionResult = { error?: string; success?: string }

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
