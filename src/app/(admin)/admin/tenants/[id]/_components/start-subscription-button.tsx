'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { startSubscriptionAction, type ActionResult } from '@/lib/admin/actions'

const initial: ActionResult = {}

export function StartSubscriptionButton({
  orgId,
  orgName,
  propertyCount,
}: {
  orgId: string
  orgName: string
  propertyCount: number
}) {
  const [state, action, pending] = useActionState(
    startSubscriptionAction,
    initial,
  )

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const qty = Math.max(1, propertyCount)
        const msg =
          `Start a Stripe subscription for ${orgName} at quantity ${qty}?\n\n` +
          `Uses the hotelops_per_property_monthly price + setup fee (if a ` +
          `hotelops_setup_fee price exists) and gives the customer 14 days ` +
          `to attach a payment method.`
        if (!confirm(msg)) e.preventDefault()
      }}
      className="space-y-2"
    >
      <input type="hidden" name="org_id" value={orgId} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Starting…' : 'Start subscription'}
      </Button>
      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}
    </form>
  )
}
