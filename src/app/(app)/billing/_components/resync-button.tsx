'use client'

import { useTransition, useState } from 'react'
import { Button } from '@/components/ui/button'
import { resyncSubscriptionsAction, type ActionResult } from '../actions'

/**
 * Owner-only "Re-sync from Stripe" button. Mirrors every Subscription on
 * the org's Stripe Customer into billing_subscriptions. Use when a row
 * looks out of date (e.g. "Not Started" while Stripe shows Active) —
 * usually after a webhook missed event or a migration-deploy race.
 */
export function ResyncButton() {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<ActionResult | null>(null)

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => {
          setMessage(null)
          startTransition(async () => {
            const result = await resyncSubscriptionsAction()
            setMessage(result)
          })
        }}
      >
        {pending ? 'Re-syncing…' : 'Re-sync from Stripe'}
      </Button>
      {message?.success ? (
        <p className="text-xs text-success-fg">{message.success}</p>
      ) : null}
      {message?.error ? (
        <p className="text-xs text-danger-fg" role="alert">
          {message.error}
        </p>
      ) : null}
    </div>
  )
}
