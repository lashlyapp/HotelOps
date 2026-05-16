'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { openBillingPortalAction } from '../actions'

/**
 * Opens Stripe's hosted Customer Portal in the same tab. The portal
 * is the canonical place for country-aware billing address edits,
 * tax IDs, payment method swaps, and invoice downloads — things the
 * flat in-app form above doesn't handle.
 *
 * Errors (most commonly: portal not configured in Stripe Dashboard
 * for this environment) surface inline so an owner doesn't see a
 * raw 500.
 */
export function OpenBillingPortalButton() {
  const [pending, startTransition] = useTransition()

  function open() {
    startTransition(async () => {
      const result = await openBillingPortalAction()
      if (result.url) {
        window.location.href = result.url
        return
      }
      if (result.error) {
        // Surface as an alert — this is the rare misconfig path
        // (portal not configured in the Stripe Dashboard) and not
        // worth a persistent toast slot. Owner sees it once and
        // pings the operator.
        alert(result.error)
      }
    })
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
        Advanced billing
      </p>
      <Button
        type="button"
        variant="secondary"
        onClick={open}
        disabled={pending}
      >
        {pending ? 'Opening…' : 'Manage in Stripe →'}
      </Button>
      <p className="text-xs text-muted leading-relaxed">
        Edit tax IDs, change payment methods, download past invoices, or
        update your billing address with country-aware formatting.
      </p>
    </div>
  )
}
