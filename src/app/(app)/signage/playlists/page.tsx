import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SignagePlaylist } from '@/lib/supabase/types'

export default async function PlaylistsListPage() {
  const session = await requireOrgUser()
  const admin = createAdminClient()
  const { data } = await admin
    .from('signage_playlists')
    .select('*')
    .eq('org_id', session.organization.id)
    .order('name', { ascending: true })
  const playlists = (data ?? []) as SignagePlaylist[]
  const propertyById = new Map(session.properties.map((p) => [p.id, p]))

  return (
    <div className="p-4 sm:p-8 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-fg">All playlists</h2>
        <Link
          href="/signage/playlists/new"
          className="focus-ring inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-fg hover:bg-primary-hover"
        >
          + New playlist
        </Link>
      </div>

      {playlists.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-muted">
            No playlists yet.{' '}
            <Link
              href="/signage/playlists/new"
              className="focus-ring rounded-sm font-medium text-fg underline"
            >
              Create one
            </Link>{' '}
            to start scheduling content.
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Property</th>
                <th className="px-5 py-3 font-medium">Default?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {playlists.map((p) => (
                <tr key={p.id} className="hover:bg-surface-muted/50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/signage/playlists/${p.id}`}
                      className="focus-ring rounded-sm font-medium text-fg"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {propertyById.get(p.property_id)?.name ?? '—'}
                  </td>
                  <td className="px-5 py-3">
                    {p.is_default ? <Badge tone="info">Default</Badge> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
