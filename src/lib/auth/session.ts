import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Organization, Profile, Property } from '@/lib/supabase/types'

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
}

export async function requireUser(): Promise<UserSession> {
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
}

export async function requireOrgUser(): Promise<OrgSession> {
  const base = await requireUser()
  if (!base.profile.org_id) {
    if (base.profile.role === 'platform_admin') redirect('/admin')
    redirect('/login?error=no_org')
  }

  const supabase = await createClient()
  const [{ data: organization }, { data: properties }] = await Promise.all([
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
  ])
  if (!organization) redirect('/login?error=no_org')

  return {
    ...base,
    organization: organization as Organization,
    properties: (properties ?? []) as Property[],
  }
}

export async function requirePlatformAdmin(): Promise<UserSession> {
  const session = await requireUser()
  if (session.profile.role !== 'platform_admin') redirect('/dashboard')
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
