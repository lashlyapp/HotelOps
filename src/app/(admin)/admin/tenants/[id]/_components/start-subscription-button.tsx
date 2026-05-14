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
        const n = Math.max(1, propertyCount)
        const msg =
          `Start Stripe subscriptions for ${orgName}?\n\n` +
          `Creates one subscription per property (${n} total), each with ` +
          `quantity 1, using the hotelops_per_property_monthly price. The ` +
          `one-time setup fee is added to each property's first invoice ` +
          `(skipped on resubscribe). Each customer gets 14 days to attach a ` +
          `card per subscription.`
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
