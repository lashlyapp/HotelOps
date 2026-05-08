import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { requirePlatformAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'

type TenantRow = {
  id: string
  name: string
  slug: string
  created_at: string
  property_count: number
  owner_email: string | null
}

export default async function AdminDashboardPage() {
  await requirePlatformAdmin()
  const tenants = await loadTenants()

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Tenants
          </h1>
          <p className="mt-1 text-sm text-muted">
            {tenants.length === 0
              ? 'No tenants yet.'
              : `${tenants.length} active organization${tenants.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        <Link
          href="/admin/tenants/new"
          className="focus-ring inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover transition-colors"
        >
          Create tenant
        </Link>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Properties</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {tenants.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-sm text-muted"
                >
                  Click <strong className="text-fg">Create tenant</strong> to add the first one.
                </td>
              </tr>
            ) : (
              tenants.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium text-fg">{t.name}</td>
                  <td className="px-4 py-3 text-muted font-mono text-xs">{t.slug}</td>
                  <td className="px-4 py-3 text-muted">{t.owner_email ?? '—'}</td>
                  <td className="px-4 py-3 text-fg tabular-nums">{t.property_count}</td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(t.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

async function loadTenants(): Promise<TenantRow[]> {
  const admin = createAdminClient()
  const { data: orgs, error } = await admin
    .from('organizations')
    .select('id, name, slug, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error

  const orgIds = (orgs ?? []).map((o) => o.id)
  if (orgIds.length === 0) return []

  const [{ data: properties }, { data: ownerProfiles }] = await Promise.all([
    admin.from('properties').select('org_id').in('org_id', orgIds),
    admin
      .from('profiles')
      .select('id, org_id, role')
      .in('org_id', orgIds)
      .eq('role', 'org_owner'),
  ])

  const propertyCounts = new Map<string, number>()
  for (const p of properties ?? []) {
    propertyCounts.set(p.org_id, (propertyCounts.get(p.org_id) ?? 0) + 1)
  }

  const ownerIds = (ownerProfiles ?? []).map((p) => p.id)
  const ownerEmails = new Map<string, string>()
  if (ownerIds.length > 0) {
    // listUsers is paginated; for v1 we assume <200 users which is plenty.
    const { data: users } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    })
    const byId = new Map<string, string>()
    for (const u of users?.users ?? []) {
      if (u.email) byId.set(u.id, u.email)
    }
    for (const profile of ownerProfiles ?? []) {
      const email = byId.get(profile.id)
      if (email && profile.org_id) ownerEmails.set(profile.org_id, email)
    }
  }

  return (orgs ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    created_at: o.created_at,
    property_count: propertyCounts.get(o.id) ?? 0,
    owner_email: ownerEmails.get(o.id) ?? null,
  }))
}
