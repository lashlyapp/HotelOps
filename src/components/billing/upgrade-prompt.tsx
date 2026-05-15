'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { addAddonAction, type ActionResult } from '@/app/(app)/billing/actions'

/**
 * Soft-gate upgrade CTA.
 *
 * Rendered inline where a customer tries to use a feature that requires
 * an add-on their org hasn't enabled. The component knows three things:
 *   1. The add-on key (drives the action + the price math)
 *   2. The price per property
 *   3. The org's current property count (so we show "× 4 properties = $196/mo
 *      total" up front instead of just "$49/property/mo")
 *
 * Clicking Enable calls the existing org-level addAddonAction — same
 * code path the /billing page uses. The user can also click "Manage in
 * Billing" to land on /billing for context.
 *
 * Non-owners get a read-only message; only org_owner can flip the
 * billing-affecting toggle.
 */

type AddonKey = 'signage_unlimited' | 'guest_experience'

const COPY: Record<
  AddonKey,
  { label: string; priceCents: number; description: string }
> = {
  signage_unlimited: {
    label: 'Signage Unlimited',
    priceCents: 4900,
    description:
      'Unlimited TV screens per property. The base plan includes 3 screens; this add-on lifts the cap so you can keep adding screens at every property in your organization.',
  },
  guest_experience: {
    label: 'Guest Experience',
    priceCents: 3900,
    description:
      'Arrival pages, printable QR cards for the in-room handout, and guest issue intake. Unlocks every property in your organization at once.',
  },
}

export function UpgradePrompt({
  addonKey,
  propertyCount,
  isOwner,
  /** Optional preface that explains what the user just tried to do. */
  reason,
}: {
  addonKey: AddonKey
  propertyCount: number
  isOwner: boolean
  reason?: string
}) {
  const copy = COPY[addonKey]
  const totalCents = copy.priceCents * Math.max(propertyCount, 0)
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    addAddonAction,
    {},
  )

  return (
    <div className="rounded-md border border-border-default bg-surface-muted/40 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs uppercase tracking-wider text-subtle">
            Requires add-on
          </p>
          <h3 className="text-base font-semibold text-fg">{copy.label}</h3>
          {reason ? (
            <p className="text-sm text-fg">{reason}</p>
          ) : null}
          <p className="text-sm text-muted">{copy.description}</p>
          <p className="pt-1 text-xs text-subtle">
            <span className="text-fg">
              ${(copy.priceCents / 100).toFixed(0)} / property / month
            </span>
            {propertyCount > 0 ? (
              <>
                {' '}
                · ${(totalCents / 100).toFixed(0)} / mo total across{' '}
                {propertyCount} {propertyCount === 1 ? 'property' : 'properties'}.
                Prorated for the remainder of each property’s current cycle and
                invoiced immediately.
              </>
            ) : null}
          </p>
          {state.error ? (
            <p className="mt-1 text-xs text-danger-fg" role="alert">
              {state.error}
            </p>
          ) : null}
        </div>

        {isOwner ? (
          <form action={action} className="shrink-0">
            <input type="hidden" name="addon_key" value={addonKey} />
            <Button type="submit" disabled={pending || propertyCount === 0}>
              {pending ? 'Enabling…' : `Enable ${copy.label}`}
            </Button>
          </form>
        ) : (
          <Link
            href="/billing"
            className="focus-ring inline-flex h-9 shrink-0 items-center rounded-md border border-border-default px-3 text-sm font-medium text-fg hover:bg-surface-muted"
          >
            Ask an owner
          </Link>
        )}
      </div>
    </div>
  )
}
