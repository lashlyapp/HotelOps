'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ItVendor, Property } from '@/lib/supabase/types'
import { saveVendorAction, type ActionResult } from '../../actions'
import { VENDOR_TYPE_LABELS, asOptions } from '../../_lib/labels'

const initial: ActionResult = {}

export function VendorForm({
  properties,
  existing,
}: {
  properties: Property[]
  existing?: ItVendor
}) {
  const [state, action, pending] = useActionState(saveVendorAction, initial)
  const options = asOptions(VENDOR_TYPE_LABELS)

  return (
    <form action={action} className="space-y-4">
      {existing ? (
        <input type="hidden" name="id" value={existing.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vendor name" htmlFor="vd-name">
          <Input
            id="vd-name"
            name="name"
            defaultValue={existing?.name ?? ''}
            placeholder="Comcast Business"
            required
          />
        </Field>
        <Field label="Type" htmlFor="vd-type">
          <select
            id="vd-type"
            name="vendor_type"
            defaultValue={existing?.vendor_type ?? 'isp'}
            className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
            required
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="Property"
        htmlFor="vd-property"
        hint="Leave blank if this vendor serves the whole organization."
      >
        <select
          id="vd-property"
          name="property_id"
          defaultValue={existing?.property_id ?? ''}
          className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
        >
          <option value="">All properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact name" htmlFor="vd-contact">
          <Input
            id="vd-contact"
            name="contact_name"
            defaultValue={existing?.contact_name ?? ''}
          />
        </Field>
        <Field label="Phone" htmlFor="vd-phone">
          <Input
            id="vd-phone"
            name="phone"
            type="tel"
            defaultValue={existing?.phone ?? ''}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="vd-email">
          <Input
            id="vd-email"
            name="email"
            type="email"
            defaultValue={existing?.email ?? ''}
          />
        </Field>
        <Field label="Website" htmlFor="vd-website">
          <Input
            id="vd-website"
            name="website"
            type="url"
            defaultValue={existing?.website ?? ''}
            placeholder="https://"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account number" htmlFor="vd-account">
          <Input
            id="vd-account"
            name="account_number"
            defaultValue={existing?.account_number ?? ''}
          />
        </Field>
        <Field label="Support hours" htmlFor="vd-hours">
          <Input
            id="vd-hours"
            name="support_hours"
            defaultValue={existing?.support_hours ?? ''}
            placeholder="Mon-Fri 9-5 ET"
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          name="is_emergency"
          defaultChecked={existing?.is_emergency ?? false}
          className="size-4 rounded border-border-default focus-ring"
        />
        <span>OK to call after-hours / overnight</span>
      </label>

      <Field label="Notes" htmlFor="vd-notes" hint="SLA terms, escalation paths, who manages the relationship.">
        <textarea
          id="vd-notes"
          name="notes"
          defaultValue={existing?.notes ?? ''}
          rows={3}
          className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg shadow-xs focus-ring"
        />
      </Field>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving...' : existing ? 'Save changes' : 'Add vendor'}
      </Button>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  )
}
