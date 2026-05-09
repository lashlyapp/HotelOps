'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Event, EventLineItem } from '@/lib/supabase/types'
import {
  addLineItemAction,
  deleteLineItemAction,
  type ActionResult,
} from '../../actions'
import {
  LINE_SECTION_LABELS,
  LINE_SECTION_ORDER,
  asOptions,
} from '../../_lib/labels'
import { computeTotals, formatMoney } from '../../_lib/money'

const initial: ActionResult = {}

export function LineItemsCard({
  event,
  lines,
  paid,
}: {
  event: Event
  lines: EventLineItem[]
  paid: number
}) {
  const [state, action, pending] = useActionState(addLineItemAction, initial)
  const totals = computeTotals(
    lines,
    Number(event.service_charge_pct ?? 0),
    Number(event.tax_pct ?? 0),
  )
  const balance = totals.total_cents - paid
  const sectionOptions = asOptions(LINE_SECTION_LABELS)

  // Group lines by section so the eye doesn't have to chase them.
  const grouped = LINE_SECTION_ORDER.map((s) => ({
    section: s,
    lines: lines.filter((l) => l.section === s),
  })).filter((g) => g.lines.length > 0)

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Pricing</CardTitle>
        <p className="text-xs text-subtle">
          {lines.length} {lines.length === 1 ? 'line' : 'lines'}
        </p>
      </CardHeader>
      <CardBody className="p-0">
        {lines.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">
            No line items yet. Add the venue fee first, then the food &amp;
            beverage minimum.
          </p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {grouped.map((g) => (
              <div key={g.section} className="px-5 py-3">
                <p className="text-xs uppercase tracking-wider text-subtle">
                  {LINE_SECTION_LABELS[g.section]}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {g.lines.map((l) => {
                    const lineTotal = Math.round(
                      Number(l.quantity) * l.unit_price_cents,
                    )
                    return (
                      <li
                        key={l.id}
                        className="flex flex-wrap items-center justify-between gap-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="text-fg">{l.description}</p>
                          <p className="mt-0.5 text-xs text-subtle">
                            {Number(l.quantity)} ×{' '}
                            {formatMoney(l.unit_price_cents)}
                            {!l.taxable ? ' · tax-exempt' : ''}
                            {!l.service_chargeable ? ' · no service charge' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-fg tabular-nums">
                            {formatMoney(lineTotal)}
                          </span>
                          <form action={deleteLineItemAction}>
                            <input type="hidden" name="id" value={l.id} />
                            <input
                              type="hidden"
                              name="event_id"
                              value={event.id}
                            />
                            <button
                              type="submit"
                              className="focus-ring rounded-sm text-xs text-muted hover:text-danger-fg"
                              aria-label={`Remove ${l.description}`}
                            >
                              Remove
                            </button>
                          </form>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}

            <div className="bg-surface-muted/40 px-5 py-3 text-sm">
              <Row label="Subtotal" value={formatMoney(totals.subtotal_cents)} />
              <Row
                label={`Service charge (${Number(event.service_charge_pct)}%)`}
                value={formatMoney(totals.service_charge_cents)}
              />
              <Row
                label={`Tax (${Number(event.tax_pct)}%)`}
                value={formatMoney(totals.tax_cents)}
              />
              <Row
                label="Total"
                value={formatMoney(totals.total_cents)}
                strong
              />
              {paid > 0 ? (
                <>
                  <Row label="Paid" value={`− ${formatMoney(paid)}`} />
                  <Row
                    label="Balance due"
                    value={formatMoney(balance)}
                    strong
                  />
                </>
              ) : null}
            </div>
          </div>
        )}

        <div className="border-t border-border-subtle p-5">
          <p className="text-xs uppercase tracking-wider text-subtle mb-3">
            Add line item
          </p>
          <form action={action} className="space-y-3">
            <input type="hidden" name="event_id" value={event.id} />

            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <div className="space-y-1.5">
                <Label htmlFor="li-desc">Description</Label>
                <Input
                  id="li-desc"
                  name="description"
                  placeholder="Plated dinner — chicken"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="li-section">Section</Label>
                <select
                  id="li-section"
                  name="section"
                  defaultValue="food"
                  className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
                  required
                >
                  {sectionOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="li-qty">Quantity</Label>
                <Input
                  id="li-qty"
                  name="quantity"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={1}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="li-price">Unit price ($)</Label>
                <Input
                  id="li-price"
                  name="unit_price"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={0}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-fg">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="taxable"
                  defaultChecked
                  className="size-4 rounded border-border-default focus-ring"
                />
                <span>Taxable</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="service_chargeable"
                  defaultChecked
                  className="size-4 rounded border-border-default focus-ring"
                />
                <span>Service chargeable</span>
              </label>
            </div>

            {state.error ? (
              <p className="text-sm text-danger-fg">{state.error}</p>
            ) : null}

            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Adding...' : 'Add line'}
            </Button>
          </form>
        </div>
      </CardBody>
    </Card>
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
