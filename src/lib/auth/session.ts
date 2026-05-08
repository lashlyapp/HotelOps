import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Organization, Profile, Property } from '@/lib/supabase/types'

export type Session = {
  userId: string
  email: string
  profile: Profile
  organization: Organization
  properties: Property[]
}

export async function requireSession(): Promise<Session> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) throw profileError
  if (!profile || !profile.org_id) {
    redirect('/login?error=no_org')
  }

  const [{ data: organization }, { data: properties }] = await Promise.all([
    supabase
      .from('organizations')
      .select('*')
      .eq('id', profile.org_id)
      .maybeSingle(),
    supabase
      .from('properties')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('name', { ascending: true }),
  ])

  if (!organization) redirect('/login?error=no_org')

  return {
    userId: user.id,
    email: user.email ?? '',
    profile: profile as Profile,
    organization: organization as Organization,
    properties: (properties ?? []) as Property[],
  }
}
