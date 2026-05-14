import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SignageScreen } from '@/lib/supabase/types'
import { isScreenOnline } from './_lib/labels'
import { pairEntryUrl, playerUrlFor } from './_lib/player-url'

type SearchParams = Promise<{ property?: string }>

export default async function ScreensListPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await requireOrgUser()
  const params = await searchParams
  const propertySlug = params.property

  const propertyTabs = [
    { slug: '', name: 'All properties', id: null as string | null },
    ...session.properties.map((p) => ({
      slug: p.slug,
      name: p.name,
      id: p.id,
    })),
  ]
  const activeProperty =
    propertyTabs.find((p) => p.slug === propertySlug) ?? propertyTabs[0]

  const admin = createAdminClient()
  let q = admin
    .from('signage_screens')
    .select('*')
    .eq('org_id', session.organization.id)
  if (activeProperty.id) q = q.eq('property_id', activeProperty.id)
  const { data } = await q.order('nickname', { ascending: true })
  const screens = (data ?? []) as SignageScreen[]

  const propertyById = new Map(session.properties.map((p) => [p.id, p]))

  return (
    <div className="p-4 sm:p-8 space-y-5">
      <nav
        aria-label="Filter by property"
        className="flex flex-wrap gap-1 text-sm"
      >
        {propertyTabs.map((tab) => {
          const isActive = activeProperty.slug === tab.slug
          const href = tab.slug ? `/signage?property=${tab.slug}` : '/signage'
          return (
            <Link
              key={tab.slug || 'all'}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={
                isActive
                  ? 'focus-ring rounded-md bg-surface-muted px-3 py-1.5 font-medium text-fg'
                  : 'focus-ring rounded-md px-3 py-1.5 text-muted hover:bg-surface-muted hover:text-fg'
              }
            >
              {tab.name}
            </Link>
          )
        })}
      </nav>

      {screens.length === 0 ? (
        <Card>
          <CardBody className="space-y-3 text-sm text-muted">
            <p>
              No screens paired yet.{' '}
              <Link
                href="/signage/screens/new"
                className="focus-ring rounded-sm font-medium text-fg underline"
              >
                Add your first one
              </Link>
              .
            </p>
            <p className="text-xs">
              You&apos;ll get a 6-digit code; enter it at{' '}
              <span className="font-mono text-fg">{pairEntryUrl()}</span> on
              any TV browser.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-5 py-3 font-medium">Screen</th>
                  <th className="px-5 py-3 font-medium">Property</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Last seen</th>
                  <th className="px-5 py-3 font-medium">Player URL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {screens.map((s) => {
                  const property = propertyById.get(s.property_id)
                  const online = isScreenOnline(s.last_heartbeat_at)
                  const pairing =
                    s.pairing_code &&
                    s.pairing_code_expires_at &&
                    new Date(s.pairing_code_expires_at) > new Date()
                      ? s.pairing_code
                      : null
                  return (
                    <tr key={s.id} className="hover:bg-surface-muted/50">
                      <td className="px-5 py-3">
                        <Link
                          href={`/signage/screens/${s.id}`}
                          className="focus-ring rounded-sm font-medium text-fg"
                        >
                          {s.nickname}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {property?.name ?? '—'}
                      </td>
                      <td className="px-5 py-3">
                        {pairing ? (
                          <Badge tone="warning">
                            Awaiting pair · {pairing}
                          </Badge>
                        ) : online ? (
                          <Badge tone="success">Online</Badge>
                        ) : (
                          <Badge tone="neutral">Offline</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted text-xs">
                        {s.last_heartbeat_at
                          ? new Date(s.last_heartbeat_at).toLocaleString()
                          : '—'}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">
                        <code className="break-all text-fg">
                          {playerUrlFor(s.player_token)}
                        </code>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
