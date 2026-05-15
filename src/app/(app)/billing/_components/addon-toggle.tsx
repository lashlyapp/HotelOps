'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import {
  addAddonAction,
  removeAddonAction,
  type ActionResult,
} from '../actions'

/**
 * Org-level add-on toggle row. Toggling here fans out to every property
 * in the org — see addAddonToOrg / removeAddonFromOrg. We surface the
 * effective monthly cost (price × property count) so the operator
 * understands what they're committing to before clicking, since the
 * pricing axis is per-property but the activation decision is global.
 */
export function AddonToggle({
  addonKey,
  label,
  priceCents,
  propertyCount,
  active,
  description,
}: {
  addonKey: 'signage_unlimited' | 'guest_experience'
  label: string
  priceCents: number
  /** Number of properties in the org. Used to compute "× N properties"
   *  cost so the operator sees the full monthly impact, not just the
   *  per-property price. */
  propertyCount: number
  active: boolean
  /** Short, plain-English explanation under the price line. Keeps the
   *  marketing copy out of the toggle component itself. */
  description?: string
}) {
  const [addState, addAction, addPending] = useActionState<
    ActionResult,
    FormData
  >(addAddonAction, {})
  const [removeState, removeAction, removePending] = useActionState<
    ActionResult,
    FormData
  >(removeAddonAction, {})
  const pending = addPending || removePending
  const message = addState.error || removeState.error
  const serverEcho = active ? addState.success : removeState.success
  const action = active ? removeAction : addAction
  const verb = active ? 'Disable' : 'Enable'

  const monthlyTotalCents = priceCents * Math.max(propertyCount, 0)

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm text-fg">
          <span className="font-medium">{label}</span>
          <span className="ml-2 text-xs text-subtle">
            {formatPrice(priceCents)} / property / mo
          </span>
          {active ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-success-bg px-1.5 text-[10px] font-medium text-success-fg">
              On
            </span>
          ) : null}
        </p>
        {description ? (
          <p className="text-xs text-muted">{description}</p>
        ) : null}
        <p className="text-[11px] text-subtle">
          {propertyCount === 0
            ? 'Add a property to enable.'
            : `${formatPrice(monthlyTotalCents)} / mo total across ${propertyCount} ${
                propertyCount === 1 ? 'property' : 'properties'
              }. Prorated when added or removed.`}
        </p>
        {message ? (
          <p className="mt-1 text-[11px] text-danger-fg" role="alert">
            {message}
          </p>
        ) : null}
        {serverEcho && !message ? (
          <p className="mt-1 text-[11px] text-success-fg">{serverEcho}</p>
        ) : null}
      </div>
      <form action={action} className="shrink-0">
        <input type="hidden" name="addon_key" value={addonKey} />
        <Button
          type="submit"
          size="sm"
          variant={active ? 'secondary' : 'primary'}
          disabled={pending || propertyCount === 0}
        >
          {pending ? '…' : verb}
        </Button>
      </form>
    </div>
  )
}

function formatPrice(cents: number): string {
  const dollars = cents / 100
  return `$${dollars.toFixed(0)}`
}
