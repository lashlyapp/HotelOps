'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import type { SavedCard } from '@/lib/stripe/subscriptions'
import {
  cancelPropertySubscriptionAction,
  detachPaymentMethodAction,
  resumeSubscriptionAction,
  setAutopayDefaultAction,
  setPropertyDefaultPaymentMethodAction,
  type ActionResult,
} from '../actions'
import { StripeRedirectButton } from './billing-actions'

/**
 * Per-property "Manage card" affordance. Renders the current card as a
 * button; clicking opens an inline popover listing every card saved on
 * the org's Stripe Customer with a radio-style picker. The customer can:
 *  - Select a saved card → server action sets it as the subscription's
 *    default_payment_method and syncs the DB.
 *  - Remove a saved card → server action detaches it from the Customer
 *    (refused when it's still the default on any active subscription).
 *  - Click "Add new card" → routes to /api/stripe/setup-checkout in
 *    mode=setup, same as the original flow, so a brand-new card can
 *    still be added without leaving the Billing page mental model.
 *
 * For properties with no subscription yet, we don't render the picker
 * (there's no subscription to attach a card to); the parent renders the
 * standalone "Start & add card" button in that case.
 */
export function PropertyCardManager({
  propertyId,
  currentPaymentMethodId,
  currentBrand,
  currentLast4,
  savedCards,
  autopayDefaultPmId,
  cancelAtPeriodEnd,
  currentPeriodEnd,
}: {
  propertyId: string
  currentPaymentMethodId: string | null
  currentBrand: string | null
  currentLast4: string | null
  savedCards: SavedCard[]
  /** Card the customer has designated as the default for auto-paying
   *  future property additions. Null when nothing is designated. */
  autopayDefaultPmId: string | null
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
}) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<{
    kind: 'success' | 'error'
    text: string
  } | null>(null)
  const [pending, startTransition] = useTransition()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  // Panel uses position:fixed so it can escape ancestor overflow (the
  // surrounding table cell may sit inside an `overflow-x-auto` wrapper).
  // We recompute the anchor coords whenever the popover opens, the
  // viewport resizes, or the user scrolls.
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  )

  useEffect(() => {
    if (!open) return
    function place() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setCoords({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      })
    }
    place()
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  const hasCard = Boolean(currentPaymentMethodId)
  const triggerLabel = hasCard
    ? `${capitalize(currentBrand)} ···· ${currentLast4 ?? '••••'}`
    : 'Add card'

  function runSelect(paymentMethodId: string) {
    setMessage(null)
    const fd = new FormData()
    fd.set('property_id', propertyId)
    fd.set('payment_method_id', paymentMethodId)
    startTransition(async () => {
      const res = await setPropertyDefaultPaymentMethodAction(
        {} as ActionResult,
        fd,
      )
      if (res.error) setMessage({ kind: 'error', text: res.error })
      else if (res.success) {
        setMessage({ kind: 'success', text: res.success })
        // Close shortly after success so the page revalidation
        // re-renders the row with the new card on first paint.
        setTimeout(() => setOpen(false), 400)
      }
    })
  }

  function runCancel() {
    if (
      !confirm(
        'Schedule this subscription to end at the end of the current period?\n\n' +
          'You will keep full access until then. No charge for the next period. ' +
          'You can undo this any time before the period ends.',
      )
    ) {
      return
    }
    setMessage(null)
    const fd = new FormData()
    fd.set('property_id', propertyId)
    startTransition(async () => {
      const res = await cancelPropertySubscriptionAction(
        {} as ActionResult,
        fd,
      )
      if (res.error) setMessage({ kind: 'error', text: res.error })
      else if (res.success) setMessage({ kind: 'success', text: res.success })
    })
  }

  function runResume() {
    setMessage(null)
    const fd = new FormData()
    fd.set('property_id', propertyId)
    startTransition(async () => {
      const res = await resumeSubscriptionAction({} as ActionResult, fd)
      if (res.error) setMessage({ kind: 'error', text: res.error })
      else if (res.success) setMessage({ kind: 'success', text: res.success })
    })
  }

  function runMakeAutopayDefault(paymentMethodId: string) {
    setMessage(null)
    const fd = new FormData()
    fd.set('payment_method_id', paymentMethodId)
    startTransition(async () => {
      const res = await setAutopayDefaultAction({} as ActionResult, fd)
      if (res.error) setMessage({ kind: 'error', text: res.error })
      else if (res.success) setMessage({ kind: 'success', text: res.success })
    })
  }

  function runDetach(paymentMethodId: string) {
    if (
      !confirm(
        'Remove this card from your account? It will no longer be available for any property.',
      )
    ) {
      return
    }
    setMessage(null)
    const fd = new FormData()
    fd.set('payment_method_id', paymentMethodId)
    startTransition(async () => {
      const res = await detachPaymentMethodAction({} as ActionResult, fd)
      if (res.error) setMessage({ kind: 'error', text: res.error })
      else if (res.success) setMessage({ kind: 'success', text: res.success })
    })
  }

  return (
    <div className="inline-block text-left">
      <Button
        ref={triggerRef}
        type="button"
        variant={hasCard ? 'secondary' : 'primary'}
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {triggerLabel}
      </Button>

      {open && coords ? (
        <div
          ref={panelRef}
          className="fixed z-50 w-80 max-w-[calc(100vw-1rem)] rounded-md border border-border-default bg-surface shadow-lg"
          style={{ top: coords.top, right: coords.right }}
        >
          <div className="px-3 py-2 border-b border-border-subtle">
            <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
              Saved cards
            </p>
          </div>

          {savedCards.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted">
              No saved cards yet. Add one below.
            </p>
          ) : (
            <ul className="max-h-72 overflow-auto divide-y divide-border-subtle">
              {savedCards.map((card) => {
                const isCurrent = card.id === currentPaymentMethodId
                const isAutopayDefault = card.id === autopayDefaultPmId
                return (
                  <li key={card.id} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        className="flex-1 text-left disabled:opacity-50"
                        disabled={pending || isCurrent}
                        onClick={() => runSelect(card.id)}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-fg">
                            {capitalize(card.brand)} ···· {card.last4 ?? '••••'}
                          </span>
                          {isCurrent ? (
                            <span className="text-xs text-success-fg">
                              In use
                            </span>
                          ) : null}
                          {isAutopayDefault ? (
                            <span
                              className="text-xs text-fg bg-surface-muted rounded px-1.5 py-0.5"
                              title="This card will auto-charge when you add a new property."
                            >
                              ★ Auto-pay default
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-subtle">
                          {formatExpiry(card.exp_month, card.exp_year)}
                        </p>
                      </button>
                      <div className="flex flex-col items-end gap-1">
                        {!isAutopayDefault ? (
                          <button
                            type="button"
                            className="text-xs text-fg hover:underline disabled:opacity-50"
                            disabled={pending}
                            onClick={() => runMakeAutopayDefault(card.id)}
                          >
                            Make auto-pay default
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="text-xs text-danger-fg hover:underline disabled:opacity-50"
                          disabled={pending}
                          onClick={() => runDetach(card.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="px-3 py-2 border-t border-border-subtle">
            <StripeRedirectButton
              endpoint="/api/stripe/setup-checkout"
              body={{ property_id: propertyId }}
              size="sm"
              variant="secondary"
            >
              + Add new card
            </StripeRedirectButton>
          </div>

          <div className="px-3 py-3 border-t border-border-subtle space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
              Subscription
            </p>
            {cancelAtPeriodEnd ? (
              <>
                <p className="text-xs text-muted leading-relaxed">
                  Scheduled to end on{' '}
                  <strong className="text-fg">
                    {currentPeriodEnd
                      ? new Date(currentPeriodEnd).toLocaleDateString()
                      : 'period end'}
                  </strong>
                  . You can still use this property until then.
                </p>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={runResume}
                  disabled={pending}
                >
                  {pending ? 'Working…' : 'Resume subscription'}
                </Button>
              </>
            ) : (
              <>
                <p className="text-xs text-muted leading-relaxed">
                  Cancel this property’s subscription. You’ll keep access
                  until the end of the current period; data is preserved
                  and you can resubscribe any time.
                </p>
                <button
                  type="button"
                  className="text-xs text-danger-fg hover:underline disabled:opacity-50"
                  onClick={runCancel}
                  disabled={pending}
                >
                  Cancel subscription
                </button>
              </>
            )}
          </div>

          {message ? (
            <p
              className={`px-3 py-2 text-xs border-t border-border-subtle ${
                message.kind === 'error' ? 'text-danger-fg' : 'text-success-fg'
              }`}
              role="status"
            >
              {message.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function capitalize(s: string | null | undefined): string {
  if (!s) return 'Card'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatExpiry(month: number | null, year: number | null): string {
  if (!month || !year) return '—'
  const m = String(month).padStart(2, '0')
  const y = String(year).slice(-2)
  return `Expires ${m}/${y}`
}
