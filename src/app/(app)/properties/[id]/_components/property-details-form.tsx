'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updatePropertyAction, type ActionResult } from '@/lib/admin/actions'
import type { Property } from '@/lib/supabase/types'

const initial: ActionResult = {}

export function PropertyDetailsForm({ property }: { property: Property }) {
  const [state, action, pending] = useActionState(
    updatePropertyAction,
    initial,
  )

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="property_id" value={property.id} />

      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field
            label="Property name"
            id="name"
            name="name"
            defaultValue={property.name}
            required
          />
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={property.description ?? ''}
              placeholder="A short blurb about the property — used on your website or shared with guests."
              className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg shadow-xs placeholder:text-subtle transition-colors focus-ring focus:border-border-strong"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field
            label="Street"
            id="address_line1"
            name="address_line1"
            defaultValue={property.address_line1 ?? ''}
            placeholder="123 Main Street"
          />
          <Field
            label="Suite, floor, unit (optional)"
            id="address_line2"
            name="address_line2"
            defaultValue={property.address_line2 ?? ''}
          />
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-3">
            <Field
              label="City"
              id="city"
              name="city"
              defaultValue={property.city ?? ''}
            />
            <Field
              label="State / Region"
              id="state"
              name="state"
              defaultValue={property.state ?? ''}
            />
            <Field
              label="Postal code"
              id="postal_code"
              name="postal_code"
              defaultValue={property.postal_code ?? ''}
            />
          </div>
          <Field
            label="Country"
            id="country"
            name="country"
            defaultValue={property.country ?? 'US'}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Phone"
              id="phone"
              name="phone"
              type="tel"
              defaultValue={property.phone ?? ''}
              placeholder="+1 408 555 0100"
            />
            <Field
              label="Email"
              id="email"
              name="email"
              type="email"
              defaultValue={property.email ?? ''}
              placeholder="reservations@example.com"
            />
          </div>
          <Field
            label="Website"
            id="website"
            name="website"
            type="url"
            defaultValue={property.website ?? ''}
            placeholder="https://example.com"
          />
        </CardBody>
      </Card>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  id,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  id: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...rest} />
    </div>
  )
}
