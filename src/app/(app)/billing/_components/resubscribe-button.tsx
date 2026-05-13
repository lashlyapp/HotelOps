'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  resubscribePropertyAction,
  type ActionResult,
} from '../actions'

/**
 * Single-action button shown on a property row whose subscription has
 * ended (status=canceled or incomplete_expired). Delegates to
 * resubscribePropertyAction which creates a fresh Stripe subscription
 * scoped to the same property. The customer's previously-saved cards
 * stay on the org's Stripe Customer, so the new sub can pick one up
 * via the saved-card picker — no card re-entry forced.
 */
export function ResubscribeButton({ propertyId }: { propertyId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run() {
    setError(null)
    const fd = new FormData()
    fd.set('property_id', propertyId)
    startTransition(async () => {
      const res = await resubscribePropertyAction({} as ActionResult, fd)
      if (res.error) setError(res.error)
    })
  }

  return (
    <div className="space-y-1 inline-block">
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={run}
        disabled={pending}
      >
        {pending ? 'Resubscribing…' : 'Resubscribe'}
      </Button>
      {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
    </div>
  )
}
