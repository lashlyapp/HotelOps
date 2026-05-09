'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ItEquipment, Property } from '@/lib/supabase/types'
import { saveEquipmentAction, type ActionResult } from '../../actions'
import {
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUS_LABELS,
  asOptions,
} from '../../_lib/labels'

const initial: ActionResult = {}

export function EquipmentForm({
  properties,
  existing,
}: {
  properties: Property[]
  existing?: ItEquipment
}) {
  const [state, action, pending] = useActionState(saveEquipmentAction, initial)
  const categoryOptions = asOptions(EQUIPMENT_CATEGORY_LABELS)
  const statusOptions = asOptions(EQUIPMENT_STATUS_LABELS)
  const defaultPropertyId =
    existing?.property_id ?? properties[0]?.id ?? ''

  return (
    <form action={action} className="space-y-4">
      {existing ? (
        <input type="hidden" name="id" value={existing.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Property" htmlFor="eq-property">
          <select
            id="eq-property"
            name="property_id"
            defaultValue={defaultPropertyId}
            className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
            required
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category" htmlFor="eq-category">
          <select
            id="eq-category"
            name="category"
            defaultValue={existing?.category ?? 'router'}
            className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
            required
          >
            {categoryOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Name" htmlFor="eq-name" hint="What you'd call it on a work order.">
        <Input
          id="eq-name"
          name="name"
          defaultValue={existing?.name ?? ''}
          placeholder="Lobby router"
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Where it lives" htmlFor="eq-location">
          <Input
            id="eq-location"
            name="location"
            defaultValue={existing?.location ?? ''}
            placeholder="Lobby ceiling / Room 201"
          />
        </Field>
        <Field label="Status" htmlFor="eq-status">
          <select
            id="eq-status"
            name="status"
            defaultValue={existing?.status ?? 'active'}
            className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Make / model" htmlFor="eq-model">
          <Input
            id="eq-model"
            name="make_model"
            defaultValue={existing?.make_model ?? ''}
            placeholder="Ubiquiti UDM-Pro"
          />
        </Field>
        <Field label="Serial number" htmlFor="eq-serial">
          <Input
            id="eq-serial"
            name="serial_number"
            defaultValue={existing?.serial_number ?? ''}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="IP address" htmlFor="eq-ip">
          <Input
            id="eq-ip"
            name="ip_address"
            defaultValue={existing?.ip_address ?? ''}
            placeholder="192.168.1.1"
          />
        </Field>
        <Field label="Purchase date" htmlFor="eq-purchase">
          <Input
            id="eq-purchase"
            name="purchase_date"
            type="date"
            defaultValue={existing?.purchase_date ?? ''}
          />
        </Field>
        <Field label="Warranty until" htmlFor="eq-warranty">
          <Input
            id="eq-warranty"
            name="warranty_until"
            type="date"
            defaultValue={existing?.warranty_until ?? ''}
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="eq-notes">
        <textarea
          id="eq-notes"
          name="notes"
          defaultValue={existing?.notes ?? ''}
          rows={3}
          className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg shadow-xs focus-ring"
          placeholder="Admin password is taped under the unit. Reboots fix the lobby TV..."
        />
      </Field>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving...' : existing ? 'Save changes' : 'Add equipment'}
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
