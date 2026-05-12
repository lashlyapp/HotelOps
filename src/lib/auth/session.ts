import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { isInternalEmail } from '@/lib/admin/policy'
import { computeGate, type BillingGate } from '@/lib/billing/gate'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type {
  BillingSubscription,
  Organization,
  Profile,
  Property,
} from '@/lib/supabase/types'

// React `cache()` dedupes per-render: layout calls require* once, the page
// then calls it again, and only one set of Supabase round-trips actually
// fires. Resets between requests (it's request-scoped, not process-scoped).

/**
 * Three callers with different access requirements.
 *
 * - requireUser:           any authed user with a profile.        Used by /account.
 * - requireOrgUser:        org member with org_id.                 Used by /media, /billing, /team.
 * - requirePlatformAdmin:  user with role = platform_admin.        Used by /admin/*.
 *
 * All three redirect to /login on failure.
 */

type UserSession = {
  userId: string
  email: string
  profile: Profile
}

export type OrgSession = UserSession & {
  organization: Organization
  properties: Property[]
  /** Billing gate decision for this org. Always present so any server action
   *  / page that uses the session can check `session.gate.restrictWrites`. */
  gate: BillingGate
}

export const requireUser = cache(async (): Promise<UserSession> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw error
  if (!profile) redirect('/login?error=no_profile')

  return {
    userId: user.id,
    email: user.email ?? '',
    profile: profile as Profile,
  }
})

export type RequireOrgUserOptions = {
  /**
   * When true, redirect to /billing if the org is gated from writes
   * (past_due ≥ 15 days, paused, canceled). Use in server actions that
   * mutate data so the user lands on the page that explains the lock.
   */
  write?: boolean
}

// Underlying cached loader. Split from requireOrgUser so the `opts.write`
// check (which can redirect) lives outside the cache wrapper — that way
// every call from a single render hits the same OrgSession regardless of
// whether the caller passed `{ write: true }` or no opts.
const loadOrgSession = cache(async (): Promise<OrgSession> => {
  const base = await requireUser()
  if (!base.profile.org_id) {
    if (base.profile.role === 'platform_admin') redirect('/admin')
    redirect('/login?error=no_org')
  }

  const supabase = await createClient()
  const admin = createAdminClient()
  const [{ data: organization }, { data: properties }, { data: subscription }] =
    await Promise.all([
      supabase
        .from('organizations')
        .select('*')
        .eq('id', base.profile.org_id)
        .maybeSingle(),
      supabase
        .from('properties')
        .select('*')
        .eq('org_id', base.profile.org_id)
        .order('name', { ascending: true }),
      // Read with the service role so a stale session cookie from before
      // the RLS policy was applied doesn't blow up here.
      admin
        .from('billing_subscriptions')
        .select('*')
        .eq('org_id', base.profile.org_id)
        .maybeSingle(),
    ])
  if (!organization) redirect('/login?error=no_org')

  const gate = computeGate((subscription as BillingSubscription | null) ?? null)
  return {
    ...base,
    organization: organization as Organization,
    properties: (properties ?? []) as Property[],
    gate,
  }
})

export async function requireOrgUser(
  opts: RequireOrgUserOptions = {},
): Promise<OrgSession> {
  const session = await loadOrgSession()
  if (opts.write && session.gate.restrictWrites) {
    redirect('/billing?gated=1')
  }
  return session
}

export async function requirePlatformAdmin(): Promise<UserSession> {
  const session = await requireUser()
  if (session.profile.role !== 'platform_admin') redirect('/dashboard')
  if (!isInternalEmail(session.email)) {
    // Sign them out so they can't keep retrying with cached cookies.
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login?error=unauthorized')
  }
  return session
}

export async function requireOrgOwner(): Promise<OrgSession> {
  const session = await requireOrgUser()
  if (session.profile.role !== 'org_owner') redirect('/dashboard')
  return session
}

/**
 * Backwards-compat shim: existing pages still call requireSession().
 * @deprecated use requireOrgUser instead.
 */
export const requireSession = requireOrgUser
export type Session = OrgSession

/**
 * Gate helper for ActionResult-returning server actions. Returns null when
 * writes are allowed, or `{ error }` to short-circuit the action.
 *
 *   const blocked = denyIfRestricted(session)
 *   if (blocked) return blocked
 */
export function denyIfRestricted(
  session: OrgSession,
): { error: string } | null {
  if (!session.gate.restrictWrites) return null
  return {
    error:
      session.gate.message ??
      'Editing is locked while billing is past due. Update payment in Billing.',
  }
}
