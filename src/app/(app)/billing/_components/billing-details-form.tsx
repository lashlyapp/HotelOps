'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { BillingDetails } from '@/lib/stripe/subscriptions'
import { updateBillingDetailsAction, type ActionResult } from '../actions'

const initial: ActionResult = {}

export function BillingDetailsForm({ details }: { details: BillingDetails }) {
  const [state, action, pending] = useActionState(
    updateBillingDetailsAction,
    initial,
  )

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
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save billing details'}
      </Button>
    </form>
  )
}
