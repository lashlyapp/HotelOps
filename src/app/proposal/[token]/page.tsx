import { notFound } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  Event,
  EventLineItem,
  EventScheduleBlock,
  Organization,
  Property,
} from '@/lib/supabase/types'
import {
  recordProposalViewAction,
  respondToProposalAction,
} from '@/app/(app)/events/actions'
import {
  EVENT_TYPE_LABELS,
  LINE_SECTION_LABELS,
  LINE_SECTION_ORDER,
} from '@/app/(app)/events/_lib/labels'
import {
  computeTotals,
  formatDateTime,
  formatMoney,
} from '@/app/(app)/events/_lib/money'

// Mark public proposals as dynamic so they always reflect the latest pricing
// and so the view-tracking action runs on every visit.
export const dynamic = 'force-dynamic'

export default async function ProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ responded?: string }>
}) {
  const { token } = await params
  const { responded } = await searchParams

  const admin = createAdminClient()
  const { data: eventRow } = await admin
    .from('events')
    .select('*')
    .eq('proposal_token', token)
    .maybeSingle()
  if (!eventRow) notFound()
  const event = eventRow as Event

  const [
    { data: org },
    { data: property },
    { data: lineRows },
    { data: blockRows },
  ] = await Promise.all([
    admin
      .from('organizations')
      .select('*')
      .eq('id', event.org_id)
      .maybeSingle(),
    admin
      .from('properties')
      .select('*')
      .eq('id', event.property_id)
      .maybeSingle(),
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
  ])
  const lines = (lineRows ?? []) as EventLineItem[]
  const blocks = (blockRows ?? []) as EventScheduleBlock[]
  const totals = computeTotals(
    lines,
    Number(event.service_charge_pct ?? 0),
    Number(event.tax_pct ?? 0),
  )

  // Fire-and-forget view tracker. Don't await — we don't want to delay the page
  // for an audit-log write, and any failure here is purely cosmetic.
  recordProposalViewAction(token).catch(() => {})

  const grouped = LINE_SECTION_ORDER.map((s) => ({
    section: s,
    lines: lines.filter((l) => l.section === s),
  })).filter((g) => g.lines.length > 0)

  const isFinal =
    event.status === 'definite' ||
    event.status === 'completed' ||
    event.status === 'cancelled' ||
    event.status === 'lost'

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 space-y-8">
      <header className="flex items-center justify-between border-b border-border-subtle pb-6">
        <Wordmark size="md" />
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-subtle">
            Proposal
          </p>
          <p className="mt-0.5 text-xs text-muted">{event.reference}</p>
        </div>
      </header>

      <section>
        <p className="text-xs uppercase tracking-wider text-subtle">
          {EVENT_TYPE_LABELS[event.event_type]}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-fg">
          {event.name}
        </h1>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Hosted at">
            {(property as Property | null)?.name ?? '—'}
          </Field>
          <Field label="Hosted by">
            {(org as Organization | null)?.name ?? '—'}
          </Field>
          <Field label="When">{formatDateTime(event.starts_at)}</Field>
          <Field label="Guests">
            {event.guests_guaranteed ??
              event.guests_expected ??
              '—'}
          </Field>
          {event.contact_name ? (
            <Field label="Prepared for">{event.contact_name}</Field>
          ) : null}
        </dl>
      </section>

      {blocks.length > 0 ? (
        <section>
          <h2 className="text-base font-semibold text-fg">Day-of timeline</h2>
          <ul className="mt-3 space-y-2">
            {blocks.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border-subtle py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-fg">{b.label}</p>
                  {b.setup_style ? (
                    <p className="mt-0.5 text-xs text-subtle">
                      {b.setup_style}
                    </p>
                  ) : null}
                </div>
                <p className="text-xs text-muted whitespace-nowrap">
                  {new Date(b.starts_at).toLocaleString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {' → '}
                  {new Date(b.ends_at).toLocaleString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-base font-semibold text-fg">What&rsquo;s included</h2>
        {lines.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            We&rsquo;ll add the line items shortly.
          </p>
        ) : (
          <div className="mt-3 space-y-5">
            {grouped.map((g) => (
              <div key={g.section}>
                <p className="text-xs uppercase tracking-wider text-subtle">
                  {LINE_SECTION_LABELS[g.section]}
                </p>
                <ul className="mt-2 divide-y divide-border-subtle">
                  {g.lines.map((l) => {
                    const lineTotal = Math.round(
                      Number(l.quantity) * l.unit_price_cents,
                    )
                    return (
                      <li
                        key={l.id}
                        className="flex flex-wrap items-baseline justify-between gap-3 py-2 text-sm"
                      >
                        <div>
                          <p className="text-fg">{l.description}</p>
                          <p className="mt-0.5 text-xs text-subtle">
                            {Number(l.quantity)} ×{' '}
                            {formatMoney(l.unit_price_cents)}
                          </p>
                        </div>
                        <p className="font-medium text-fg tabular-nums">
                          {formatMoney(lineTotal)}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}

            <div className="rounded-md border border-border-subtle bg-surface-muted p-4 text-sm">
              <Row label="Subtotal" value={formatMoney(totals.subtotal_cents)} />
              {totals.service_charge_cents > 0 ? (
                <Row
                  label={`Service charge (${Number(event.service_charge_pct)}%)`}
                  value={formatMoney(totals.service_charge_cents)}
                />
              ) : null}
              {totals.tax_cents > 0 ? (
                <Row
                  label={`Tax (${Number(event.tax_pct)}%)`}
                  value={formatMoney(totals.tax_cents)}
                />
              ) : null}
              <Row
                label="Total"
                value={formatMoney(totals.total_cents)}
                strong
              />
            </div>
          </div>
        )}
      </section>

      <section className="border-t border-border-subtle pt-6">
        {responded || isFinal || event.proposal_response ? (
          <ResponseSummary event={event} />
        ) : (
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-fg">Ready to confirm?</h2>
            <p className="text-sm text-muted">
              Accepting marks the date as held. We&rsquo;ll follow up with the
              contract and deposit details.
            </p>
            <div className="flex flex-wrap gap-3">
              <form action={respondToProposalAction}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="response" value="accepted" />
                <button
                  type="submit"
                  className="focus-ring rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg hover:bg-primary-hover"
                >
                  Accept proposal
                </button>
              </form>
              <form action={respondToProposalAction}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="response" value="declined" />
                <button
                  type="submit"
                  className="focus-ring rounded-md border border-border-default px-5 py-2.5 text-sm font-medium text-fg hover:bg-surface-muted"
                >
                  Decline
                </button>
              </form>
            </div>
            <p className="text-xs text-subtle">
              Questions? Reply to the email or call us — we&rsquo;ll adjust this
              and resend.
            </p>
          </div>
        )}
      </section>

      <footer className="text-center text-xs text-subtle pt-6">
        {(org as Organization | null)?.name ?? 'HotelOps'}
      </footer>
    </div>
  )
}

function ResponseSummary({ event }: { event: Event }) {
  if (event.proposal_response === 'accepted' || event.status === 'definite') {
    return (
      <div className="rounded-md border border-success-fg/20 bg-success-bg p-4 text-sm text-success-fg">
        <p className="font-medium">Thanks — we&rsquo;ve got you down.</p>
        <p className="mt-1">
          We&rsquo;ll be in touch shortly with the contract and next steps.
        </p>
      </div>
    )
  }
  if (event.proposal_response === 'declined' || event.status === 'lost') {
    return (
      <div className="rounded-md border border-border-subtle bg-surface-muted p-4 text-sm text-muted">
        <p className="font-medium text-fg">Got it — no hard feelings.</p>
        <p className="mt-1">
          If anything changes, just reply to the email and we&rsquo;ll
          reactivate this.
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-md border border-border-subtle bg-surface-muted p-4 text-sm text-muted">
      This proposal has been finalized.
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm text-fg">{children}</dd>
    </div>
  )
}

function Row({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div
      className={
        strong
          ? 'flex items-center justify-between py-1 font-semibold text-fg'
          : 'flex items-center justify-between py-1 text-muted'
      }
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
