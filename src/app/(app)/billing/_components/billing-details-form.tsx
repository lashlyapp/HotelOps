'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { BillingDetails } from '@/lib/stripe/subscriptions'
import { updateBillingDetailsAction, type ActionResult } from '../actions'

const initial: ActionResult = {}

export function BillingDetailsForm({ details }: { details: BillingDetails }) {
  const [editing, setEditing] = useState(false)
  // Wrap the server action so a successful save also flips us back to the
  // read-only summary. Doing it here (inside the transition that
  // useActionState already opens) avoids a follow-up setState-in-effect.
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
    <form action={action} className="space-y-4">
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
        <Label htmlFor="billing-line1">Address line 1</Label>
        <Input
          id="billing-line1"
          name="address.line1"
          type="text"
          defaultValue={details.address.line1 ?? ''}
          maxLength={200}
          autoComplete="address-line1"
          placeholder="123 Main St"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="billing-line2">Address line 2</Label>
        <Input
          id="billing-line2"
          name="address.line2"
          type="text"
          defaultValue={details.address.line2 ?? ''}
          maxLength={200}
          autoComplete="address-line2"
          placeholder="Suite 400"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="billing-city">City</Label>
          <Input
            id="billing-city"
            name="address.city"
            type="text"
            defaultValue={details.address.city ?? ''}
            maxLength={200}
            autoComplete="address-level2"
            placeholder="Cupertino"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="billing-state">State / Region</Label>
          <Input
            id="billing-state"
            name="address.state"
            type="text"
            defaultValue={details.address.state ?? ''}
            maxLength={200}
            autoComplete="address-level1"
            placeholder="CA"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="billing-postal">Postal code</Label>
          <Input
            id="billing-postal"
            name="address.postal_code"
            type="text"
            defaultValue={details.address.postal_code ?? ''}
            maxLength={200}
            autoComplete="postal-code"
            placeholder="95014"
          />
        </div>
      </div>

      <div className="space-y-1.5 sm:max-w-[8rem]">
        <Label htmlFor="billing-country">Country</Label>
        <Input
          id="billing-country"
          name="address.country"
          type="text"
          defaultValue={details.address.country ?? 'US'}
          maxLength={2}
          autoComplete="country"
          placeholder="US"
        />
      </div>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save billing details'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => setEditing(false)}
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
