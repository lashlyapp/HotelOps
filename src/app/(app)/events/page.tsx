import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Event, EventStatus } from '@/lib/supabase/types'
import { EVENT_TYPE_LABELS, STATUS_LABELS, STATUS_TONE } from './_lib/labels'
import { formatDate, formatMoney } from './_lib/money'

const FILTERS: Array<{ value: EventStatus | 'all' | 'open'; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'all', label: 'All' },
  { value: 'inquiry', label: 'Inquiry' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'proposal_sent', label: 'Proposal sent' },
  { value: 'definite', label: 'Definite' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled / lost' },
]

const OPEN_STATUSES: EventStatus[] = [
  'inquiry',
  'tentative',
  'proposal_sent',
  'definite',
  'in_progress',
]

export default async function EventsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await requireOrgUser()
  const params = await searchParams
  const filter = (params.status ?? 'open') as EventStatus | 'all' | 'open'

  const admin = createAdminClient()
  let query = admin
    .from('events')
    .select('*')
    .eq('org_id', session.organization.id)
    .order('starts_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (filter === 'open') {
    query = query.in('status', OPEN_STATUSES)
  } else if (filter === 'cancelled') {
    query = query.in('status', ['cancelled', 'lost'])
  } else if (filter !== 'all') {
    query = query.eq('status', filter)
  }

  const { data } = await query
  const events = (data ?? []) as Event[]
  const propertyById = new Map(session.properties.map((p) => [p.id, p]))

  return (
    <div className="p-8 space-y-5 max-w-6xl">
      <nav
        aria-label="Filter events by status"
        className="flex flex-wrap gap-1 text-sm"
      >
        {FILTERS.map((f) => {
          const isActive = filter === f.value
          return (
            <Link
              key={f.value}
              href={f.value === 'open' ? '/events' : `/events?status=${f.value}`}
              className={
                isActive
                  ? 'focus-ring rounded-md bg-surface-muted px-3 py-1.5 font-medium text-fg'
                  : 'focus-ring rounded-md px-3 py-1.5 text-muted hover:bg-surface-muted hover:text-fg'
              }
            >
              {f.label}
            </Link>
          )
        })}
      </nav>

      {events.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-muted">
            {filter === 'open' ? (
              <>
                No open events.{' '}
                <Link
                  href="/events/new"
                  className="focus-ring rounded-sm font-medium text-fg underline"
                >
                  Add an inquiry
                </Link>{' '}
                to get started.
              </>
            ) : (
              <>No events match this filter.</>
            )}
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
              <tr>
                <th className="px-5 py-3 font-medium">Event</th>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {events.map((e) => {
                const prop = propertyById.get(e.property_id)
                return (
                  <tr key={e.id} className="hover:bg-surface-muted/50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/events/${e.id}`}
                        className="focus-ring rounded-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-fg">{e.name}</span>
                          <span className="text-xs text-subtle">{e.reference}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-subtle">
                          {EVENT_TYPE_LABELS[e.event_type]}
                          {prop ? ` · ${prop.name}` : ''}
                          {e.contact_name ? ` · ${e.contact_name}` : ''}
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-fg whitespace-nowrap">
                      {formatDate(e.starts_at)}
                      {e.guests_expected ? (
                        <div className="text-xs text-subtle">
                          {e.guests_expected} guests
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[e.status]}>
                        {STATUS_LABELS[e.status]}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-fg tabular-nums whitespace-nowrap">
                      {e.total_cents > 0 ? formatMoney(e.total_cents) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
