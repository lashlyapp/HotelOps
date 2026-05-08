import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requirePlatformAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AppRole, Organization, Property } from '@/lib/supabase/types'
import { AddMemberSection } from './_components/add-member-section'
import { AddPropertySection } from './_components/add-property-section'
import { DeleteTenantSection } from './_components/delete-tenant-section'
import { OrgNameSection } from './_components/org-name-section'
import { RemovePropertyButton } from './_components/remove-property-button'
import { RemoveMemberButton } from './_components/remove-member-button'

type Member = {
  id: string
  email: string | null
  role: AppRole
  full_name: string | null
  created_at: string
}

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePlatformAdmin()
  const { id } = await params

  const data = await loadTenant(id)
  if (!data) notFound()

  const { organization, properties, members } = data

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Link
            href="/admin"
            className="focus-ring rounded-sm text-xs font-medium text-muted hover:text-fg"
          >
            ← Tenants
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">
            {organization.name}
          </h1>
          <p className="mt-1 text-sm text-muted font-mono">
            {organization.slug} · created{' '}
            {new Date(organization.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </p>
        </div>
      </div>

      <OrgNameSection orgId={organization.id} initialName={organization.name} />

      <Card>
        <CardHeader>
          <CardTitle>Properties ({properties.length})</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {properties.length === 0 ? (
            <p className="text-sm text-muted">No properties yet.</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {properties.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">{p.name}</p>
                    <p className="text-xs text-subtle font-mono truncate">
                      {p.r2_prefix}
                    </p>
                  </div>
                  <RemovePropertyButton orgId={organization.id} propertyId={p.id} />
                </li>
              ))}
            </ul>
          )}
          <AddPropertySection
            orgId={organization.id}
            orgSlug={organization.slug}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {members.length === 0 ? (
            <p className="text-sm text-muted">
              No members yet. Add the initial owner below.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-fg truncate">{m.email ?? '—'}</p>
                      {m.full_name ? (
                        <p className="text-xs text-subtle">{m.full_name}</p>
                      ) : null}
                    </div>
                    <Badge tone={m.role === 'org_owner' ? 'info' : 'neutral'}>
                      {m.role.replace('_', ' ')}
                    </Badge>
                  </div>
                  <RemoveMemberButton orgId={organization.id} userId={m.id} />
                </li>
              ))}
            </ul>
          )}
          <AddMemberSection orgId={organization.id} />
        </CardBody>
      </Card>

      <DeleteTenantSection
        orgId={organization.id}
        orgSlug={organization.slug}
      />
    </div>
  )
}

async function loadTenant(orgId: string) {
  const admin = createAdminClient()
  const { data: organization } = await admin
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .maybeSingle()
  if (!organization) return null

  const [{ data: properties }, { data: profiles }] = await Promise.all([
    admin
      .from('properties')
      .select('*')
      .eq('org_id', orgId)
      .order('name', { ascending: true }),
    admin
      .from('profiles')
      .select('id, role, full_name, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true }),
  ])

  // Resolve emails via auth admin API.
  const emailById = new Map<string, string>()
  const profileIds = (profiles ?? []).map((p) => p.id)
  if (profileIds.length > 0) {
    const { data: users } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    })
    for (const u of users?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email)
    }
  }

  const members: Member[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: emailById.get(p.id) ?? null,
    role: p.role as AppRole,
    full_name: p.full_name,
    created_at: p.created_at,
  }))

  return {
    organization: organization as Organization,
    properties: (properties ?? []) as Property[],
    members,
  }
}
