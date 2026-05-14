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

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-fg">
          {label}{' '}
          <span className="text-xs text-subtle">
            · {formatPrice(priceCents)} / month
          </span>
        </p>
        <p className="text-xs text-muted">
          {active
            ? 'Active. Prorated credit applied if removed mid-cycle.'
            : 'Adds a line item to this property’s next invoice (prorated).'}
        </p>
        {message ? (
          <p className="mt-1 text-xs text-danger-fg" role="alert">
            {message}
          </p>
        ) : null}
        {serverEcho && !message ? (
          <p className="mt-1 text-xs text-success-fg">{serverEcho}</p>
        ) : null}
      </div>
      <form action={action}>
        <input type="hidden" name="property_id" value={propertyId} />
        <input type="hidden" name="addon_key" value={addonKey} />
        <Button
          type="submit"
          size="sm"
          variant={active ? 'secondary' : 'primary'}
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
