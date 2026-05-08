import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requirePlatformAdmin } from '@/lib/auth/session'
import { r2PublicUrl } from '@/lib/r2/client'
import { listMediaForPrefix } from '@/lib/r2/list'
import { computeLibraryStats, formatBytes, formatRelative } from '@/lib/r2/stats'
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

  // Per-property R2 listing — small property counts in v1, fine to fan out.
  const propertyStats = await Promise.all(
    properties.map(async (property) => ({
      property,
      stats: computeLibraryStats(await listMediaForPrefix(property.r2_prefix)),
    })),
  )

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
        <CardBody className="p-0">
          {properties.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted">No properties yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-5 py-3 font-medium">Property</th>
                  <th className="px-5 py-3 font-medium">Files</th>
                  <th className="px-5 py-3 font-medium">Storage</th>
                  <th className="px-5 py-3 font-medium">Last upload</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {propertyStats.map(({ property, stats }) => (
                  <tr key={property.id}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <PropertyLogo property={property} />
                        <div className="min-w-0">
                          <p className="text-fg font-medium truncate">
                            {property.name}
                          </p>
                          <p className="text-xs text-subtle font-mono truncate">
                            {property.slug} · {property.r2_prefix}
                          </p>
                          {formatLocation(property) ? (
                            <p className="text-xs text-muted truncate">
                              {formatLocation(property)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-fg tabular-nums">
                      {stats.fileCount}
                    </td>
                    <td className="px-5 py-3 text-muted tabular-nums">
                      {formatBytes(stats.totalBytes)}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {formatRelative(stats.lastModified)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <RemovePropertyButton
                        orgId={organization.id}
                        propertyId={property.id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="border-t border-border-subtle p-5">
            <AddPropertySection
              orgId={organization.id}
              orgSlug={organization.slug}
            />
          </div>
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

function PropertyLogo({ property }: { property: Property }) {
  if (property.logo_key) {
    const cacheBust = property.logo_uploaded_at
      ? `?t=${new Date(property.logo_uploaded_at).getTime()}`
      : ''
    return (
      <div className="size-10 shrink-0 rounded-md overflow-hidden border border-border-subtle bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${r2PublicUrl(property.logo_key)}${cacheBust}`}
          alt=""
          className="size-full object-cover"
        />
      </div>
    )
  }
  return (
    <div className="size-10 shrink-0 rounded-md border border-border-subtle bg-surface-muted flex items-center justify-center text-sm font-semibold text-muted">
      {property.name.charAt(0).toUpperCase()}
    </div>
  )
}

function formatLocation(p: Property): string | null {
  const parts = [p.city, p.state].filter(Boolean) as string[]
  if (parts.length === 0) return null
  return parts.join(', ')
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
