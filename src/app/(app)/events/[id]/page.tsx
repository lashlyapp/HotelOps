import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  Event,
  EventActivity,
  EventLineItem,
  EventPayment,
  EventScheduleBlock,
  EventSpace,
} from '@/lib/supabase/types'
import { EventDetailsForm } from './_components/event-details-form'
import { LineItemsCard } from './_components/line-items-card'
import { PaymentsCard } from './_components/payments-card'
import { ProposalCard } from './_components/proposal-card'
import { RatesForm } from './_components/rates-form'
import { ScheduleCard } from './_components/schedule-card'
import { StatusActions } from './_components/status-actions'
import {
  EVENT_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
} from '../_lib/labels'
import { formatDateTime, formatMoney } from '../_lib/money'

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireOrgUser()
  const orgId = session.organization.id

  const admin = createAdminClient()
  const { data: eventRow } = await admin
    .from('events')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!eventRow) notFound()
  const event = eventRow as Event

  const [
    { data: spaceRows },
    { data: lineRows },
    { data: blockRows },
    { data: paymentRows },
    { data: activityRows },
  ] = await Promise.all([
    admin
      .from('event_spaces')
      .select('*')
      .eq('org_id', orgId)
      .eq('property_id', event.property_id)
      .order('name', { ascending: true }),
    admin
      .from('event_line_items')
      .select('*')
      .eq('event_id', event.id)
      .order('section', { ascending: true })
      .order('created_at', { ascending: true }),
    admin
      .from('event_schedule_blocks')
      .select('*')
      .eq('event_id', event.id)
      .order('starts_at', { ascending: true }),
    admin
      .from('event_payments')
      .select('*')
      .eq('event_id', event.id)
      .order('received_at', { ascending: false }),
    admin
      .from('event_activity')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  const spaces = (spaceRows ?? []) as EventSpace[]
  const lines = (lineRows ?? []) as EventLineItem[]
  const blocks = (blockRows ?? []) as EventScheduleBlock[]
  const payments = (paymentRows ?? []) as EventPayment[]
  const activity = (activityRows ?? []) as EventActivity[]
  const property = session.properties.find((p) => p.id === event.property_id)

  const paid = payments.reduce((sum, p) => sum + p.amount_cents, 0)
  const balance = event.total_cents - paid

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-6xl">
      <div>
        <Link
          href="/events"
          className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
        >
          ← All events
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-fg">
                {event.name}
              </h2>
              <span className="text-xs text-subtle">{event.reference}</span>
              <Badge tone={STATUS_TONE[event.status]}>
                {STATUS_LABELS[event.status]}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-subtle">
              {EVENT_TYPE_LABELS[event.event_type]}
              {property ? ` · ${property.name}` : ''}
              {event.starts_at ? ` · ${formatDateTime(event.starts_at)}` : ''}
            </p>
          </div>
          <StatusActions event={event} />
        </div>
      </div>

      {/* Top KPI strip */}
      <section
        aria-label="Event totals"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <Kpi
          label="Total"
          value={event.total_cents > 0 ? formatMoney(event.total_cents) : '—'}
        />
        <Kpi label="Paid" value={formatMoney(paid)} />
        <Kpi
          label="Balance"
          value={event.total_cents > 0 ? formatMoney(balance) : '—'}
          tone={balance > 0 && event.total_cents > 0 ? 'warning' : 'neutral'}
        />
        <Kpi
          label="Guests"
          value={
            event.guests_actual?.toString() ??
            event.guests_guaranteed?.toString() ??
            event.guests_expected?.toString() ??
            '—'
          }
          hint={
            event.guests_actual
              ? 'actual'
              : event.guests_guaranteed
                ? 'guaranteed'
                : event.guests_expected
                  ? 'expected'
                  : undefined
          }
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left column: details + schedule + line items + payments */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardBody>
              <EventDetailsForm event={event} />
            </CardBody>
          </Card>

          <ScheduleCard event={event} blocks={blocks} spaces={spaces} />

          <LineItemsCard event={event} lines={lines} paid={paid} />

          <Card>
            <CardHeader>
              <CardTitle>Tax &amp; service charge</CardTitle>
            </CardHeader>
            <CardBody>
              <RatesForm event={event} />
            </CardBody>
          </Card>

          <PaymentsCard event={event} payments={payments} />
        </div>

        {/* Right column: proposal + activity */}
        <div className="space-y-5">
          <ProposalCard event={event} />

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              {activity.length === 0 ? (
                <p className="p-5 text-sm text-muted">Nothing yet.</p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {activity.map((a) => (
                    <li key={a.id} className="px-5 py-3">
                      <p className="text-sm text-fg">{a.message}</p>
                      <p className="mt-0.5 text-xs text-subtle">
                        {a.actor_label ?? 'System'} ·{' '}
                        {new Date(a.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'neutral' | 'warning'
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4 shadow-xs">
      <p className="text-xs uppercase tracking-wider text-subtle">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-fg tabular-nums">
        {value}
      </p>
      {hint ? (
        <p
          className={
            tone === 'warning'
              ? 'mt-0.5 text-xs text-warning-fg'
              : 'mt-0.5 text-xs text-subtle'
          }
        >
          {hint}
        </p>
      ) : null}
    </div>
  )
}
