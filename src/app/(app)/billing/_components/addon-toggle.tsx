'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import {
  addAddonAction,
  removeAddonAction,
  type ActionResult,
} from '../actions'

/**
 * Per-property add-on row. Shows a label + price, the current state, and
 * the opposing action (Add when off, Remove when on). The "active" prop
 * comes from the parent (mirrored from Stripe via the webhook) — we don't
 * optimistically render an "on" state because Stripe is the source of
 * truth and we'd rather show a spinner for a beat than flicker.
 */
export function AddonToggle({
  propertyId,
  addonKey,
  label,
  priceCents,
  active,
}: {
  propertyId: string
  addonKey: 'signage_unlimited' | 'guest_experience'
  label: string
  priceCents: number
  active: boolean
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
  // The active prop is the source of truth (parent re-renders after the
  // webhook updates the row), so the success message is just the most
  // recent matching action — no need to derive it through state.
  const serverEcho = active ? addState.success : removeState.success
  const action = active ? removeAction : addAction
  const verb = active ? 'Remove' : 'Add'

  const tooltip = active
    ? 'Active. Prorated credit if removed mid-cycle.'
    : 'Adds a line item to this property’s next invoice (prorated).'

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <p className="text-sm text-fg" title={tooltip}>
          <span className="font-medium">{label}</span>
          <span className="ml-1 text-xs text-subtle">
            {formatPrice(priceCents)}/mo
          </span>
          {active ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-success-bg px-1.5 text-[10px] font-medium text-success-fg">
              On
            </span>
          ) : null}
        </p>
        {message ? (
          <p className="mt-0.5 text-[11px] text-danger-fg" role="alert">
            {message}
          </p>
        ) : null}
        {serverEcho && !message ? (
          <p className="mt-0.5 text-[11px] text-success-fg">{serverEcho}</p>
        ) : null}
      </div>
      <form action={action}>
        <input type="hidden" name="property_id" value={propertyId} />
        <input type="hidden" name="addon_key" value={addonKey} />
        <Button
          type="submit"
          size="sm"
          variant={active ? 'ghost' : 'secondary'}
          disabled={pending}
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
