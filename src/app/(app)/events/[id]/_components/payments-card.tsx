'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Event, EventPayment } from '@/lib/supabase/types'
import {
  addPaymentAction,
  deletePaymentAction,
  type ActionResult,
} from '../../actions'
import { PAYMENT_METHOD_LABELS, asOptions } from '../../_lib/labels'
import { formatMoney } from '../../_lib/money'

const initial: ActionResult = {}

export function PaymentsCard({
  event,
  payments,
}: {
  event: Event
  payments: EventPayment[]
}) {
  const [state, action, pending] = useActionState(addPaymentAction, initial)
  const total = payments.reduce((s, p) => s + p.amount_cents, 0)
  const methodOptions = asOptions(PAYMENT_METHOD_LABELS)

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Payments</CardTitle>
        <p className="text-xs text-subtle">
          {formatMoney(total)} received
        </p>
      </CardHeader>
      <CardBody className="p-0">
        {payments.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">
            No payments recorded. Log the deposit when it lands.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-fg tabular-nums">
                    {formatMoney(p.amount_cents)}
                  </p>
                  <p className="mt-0.5 text-xs text-subtle">
                    {PAYMENT_METHOD_LABELS[p.method]} ·{' '}
                    {new Date(p.received_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    {p.reference ? ` · ref ${p.reference}` : ''}
                  </p>
                  {p.notes ? (
                    <p className="mt-1 text-xs text-muted whitespace-pre-wrap">
                      {p.notes}
                    </p>
                  ) : null}
                </div>
                <form action={deletePaymentAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="event_id" value={event.id} />
                  <button
                    type="submit"
                    className="focus-ring rounded-sm text-xs text-muted hover:text-danger-fg"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border-subtle p-5">
          <p className="text-xs uppercase tracking-wider text-subtle mb-3">
            Record payment
          </p>
          <form action={action} className="space-y-3">
            <input type="hidden" name="event_id" value={event.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="pm-amt">Amount ($)</Label>
                <Input
                  id="pm-amt"
                  name="amount"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pm-method">Method</Label>
                <select
                  id="pm-method"
                  name="method"
                  defaultValue="check"
                  className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
                  required
                >
                  {methodOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pm-date">Received</Label>
                <Input
                  id="pm-date"
                  name="received_at"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pm-ref">Reference</Label>
                <Input
                  id="pm-ref"
                  name="reference"
                  placeholder="Check #1234, last4 etc."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pm-notes">Notes</Label>
                <Input id="pm-notes" name="notes" />
              </div>
            </div>

            {state.error ? (
              <p className="text-sm text-danger-fg">{state.error}</p>
            ) : null}

            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Saving...' : 'Record payment'}
            </Button>
          </form>
        </div>
      </CardBody>
    </Card>
  )
}
