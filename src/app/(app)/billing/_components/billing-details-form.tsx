'use client'

import { AddressElement, Elements } from '@stripe/react-stripe-js'
import type { StripeAddressElementChangeEvent } from '@stripe/stripe-js'
import { useActionState, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getStripeJs } from '@/lib/stripe/client-publishable'
import type { BillingDetails } from '@/lib/stripe/subscriptions'
import { updateBillingDetailsAction, type ActionResult } from '../actions'

const initial: ActionResult = {}

/** Single Promise reused across mounts so the Stripe.js script
 *  loads once per session. */
const stripePromise = getStripeJs()

/**
 * In-app billing-details editor. Fully whitelabel — the address
 * portion uses Stripe's Address Element which automatically
 * renders the right fields per country (UK shows Postcode + County,
 * JP shows 〒 + 都道府県, US shows ZIP + state, BR shows CEP +
 * estado, IN shows PIN + state, …). The element runs entirely on
 * myhotelops.com; nothing about it is "go to billing.stripe.com."
 *
 * Email + name stay as native inputs because (a) they're not
 * country-formatted and (b) the existing server action expects
 * them in formData.
 *
 * The Address Element doesn't post addresses through formData by
 * default — it's a client-side widget. We capture its value via
 * the onChange handler into a hidden input that the form submits,
 * so the existing updateBillingDetailsAction (which reads from
 * formData and forwards to customers.update server-side) keeps
 * working unchanged.
 */
export function BillingDetailsForm({ details }: { details: BillingDetails }) {
  const [editing, setEditing] = useState(false)
  const [state, action, pending] = useActionState(
    async (prev: ActionResult, fd: FormData): Promise<ActionResult> => {
      const result = await updateBillingDetailsAction(prev, fd)
      if (result.success) setEditing(false)
      return result
    },
    initial,
  )

  if (!editing) {
    return (
      <div className="space-y-4">
        <BillingDetailsSummary details={details} />
        {state.success ? (
          <p className="text-sm text-success-fg">{state.success}</p>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setEditing(true)}
        >
          Edit billing details
        </Button>
      </div>
    )
  }

  return (
    <BillingDetailsEditForm
      details={details}
      pending={pending}
      action={action}
      onCancel={() => setEditing(false)}
      error={state.error}
    />
  )
}

function BillingDetailsEditForm({
  details,
  pending,
  action,
  onCancel,
  error,
}: {
  details: BillingDetails
  pending: boolean
  action: (formData: FormData) => void
  onCancel: () => void
  error: string | undefined
}) {
  // Buffer the Address Element's latest value into refs so submit
  // can serialize them into hidden inputs without triggering a
  // re-render on every keystroke.
  const addressRef = useRef<{
    line1: string | null
    line2: string | null
    city: string | null
    state: string | null
    postal_code: string | null
    country: string | null
  }>({
    line1: details.address.line1,
    line2: details.address.line2,
    city: details.address.city,
    state: details.address.state,
    postal_code: details.address.postal_code,
    country: details.address.country,
  })

  function handleChange(e: StripeAddressElementChangeEvent) {
    const a = e.value.address
    addressRef.current = {
      line1: a.line1 ?? null,
      line2: a.line2 ?? null,
      city: a.city ?? null,
      state: a.state ?? null,
      postal_code: a.postal_code ?? null,
      country: a.country ?? null,
    }
  }

  function handleSubmit(formData: FormData) {
    // Strip any stale address.* values React might have appended and
    // replace with the current Address Element snapshot.
    for (const key of [
      'address.line1',
      'address.line2',
      'address.city',
      'address.state',
      'address.postal_code',
      'address.country',
    ]) {
      formData.delete(key)
    }
    const a = addressRef.current
    if (a.line1) formData.set('address.line1', a.line1)
    if (a.line2) formData.set('address.line2', a.line2)
    if (a.city) formData.set('address.city', a.city)
    if (a.state) formData.set('address.state', a.state)
    if (a.postal_code) formData.set('address.postal_code', a.postal_code)
    if (a.country) formData.set('address.country', a.country)
    action(formData)
  }

  // Pre-fill the Address Element with whatever Stripe already has on
  // the Customer so reopening the form doesn't show an empty form.
  const defaultValues = {
    name: details.name ?? '',
    address: {
      line1: details.address.line1 ?? '',
      line2: details.address.line2 ?? '',
      city: details.address.city ?? '',
      state: details.address.state ?? '',
      postal_code: details.address.postal_code ?? '',
      country: details.address.country ?? 'US',
    },
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="billing-email">Billing email</Label>
          <Input
            id="billing-email"
            name="email"
            type="email"
            required
            defaultValue={details.email ?? ''}
            autoComplete="email"
            placeholder="accounting@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="billing-name">Company name</Label>
          <Input
            id="billing-name"
            name="name"
            type="text"
            defaultValue={details.name ?? ''}
            maxLength={200}
            autoComplete="organization"
            placeholder="CG Hotel Group"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Billing address</Label>
        <p className="text-xs text-muted leading-relaxed">
          Pick your country first — the rest of the address fields adjust
          automatically (UK postcode, Japanese 〒, Indian PIN, etc.).
        </p>
        <div className="rounded-md border border-border-default bg-surface p-3">
          <Elements
            stripe={stripePromise}
            options={{
              mode: 'setup',
              currency: 'usd',
              appearance: { theme: 'stripe', variables: { fontFamily: 'inherit' } },
            }}
          >
            <AddressElement
              options={{
                mode: 'billing',
                defaultValues,
                fields: { phone: 'never' },
              }}
              onChange={handleChange}
            />
          </Elements>
        </div>
      </div>

      {error ? <p className="text-sm text-danger-fg">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save billing details'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

function BillingDetailsSummary({ details }: { details: BillingDetails }) {
  const addressLines = formatAddressLines(details.address)
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
      <SummaryRow label="Billing email">
        {details.email ?? <span className="text-subtle">Not set</span>}
      </SummaryRow>
      <SummaryRow label="Company name">
        {details.name ?? <span className="text-subtle">Not set</span>}
      </SummaryRow>
      <SummaryRow label="Address" className="sm:col-span-2">
        {addressLines.length === 0 ? (
          <span className="text-subtle">Not set</span>
        ) : (
          <div className="space-y-0.5">
            {addressLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
      </SummaryRow>
    </dl>
  )
}

function SummaryRow({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wider text-subtle">{label}</dt>
      <dd className="mt-1 text-fg">{children}</dd>
    </div>
  )
}

function formatAddressLines(address: BillingDetails['address']): string[] {
  const lines: string[] = []
  if (address.line1) lines.push(address.line1)
  if (address.line2) lines.push(address.line2)
  const cityStatePostal = [
    address.city,
    address.state,
    address.postal_code,
  ]
    .filter(Boolean)
    .join(', ')
  if (cityStatePostal) lines.push(cityStatePostal)
  if (address.country) lines.push(address.country)
  return lines
}
