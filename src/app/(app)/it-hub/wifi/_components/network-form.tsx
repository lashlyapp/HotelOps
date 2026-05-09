'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ItNetwork, Property } from '@/lib/supabase/types'
import { saveNetworkAction, type ActionResult } from '../../actions'
import { NETWORK_TYPE_LABELS, asOptions } from '../../_lib/labels'

const initial: ActionResult = {}

export function NetworkForm({
  properties,
  existing,
}: {
  properties: Property[]
  existing?: ItNetwork
}) {
  const [state, action, pending] = useActionState(saveNetworkAction, initial)
  const options = asOptions(NETWORK_TYPE_LABELS)
  const defaultPropertyId =
    existing?.property_id ?? properties[0]?.id ?? ''

  return (
    <form action={action} className="space-y-4">
      {existing ? (
        <input type="hidden" name="id" value={existing.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Property" htmlFor="net-property">
          <select
            id="net-property"
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
        <Field label="Type" htmlFor="net-type">
          <select
            id="net-type"
            name="network_type"
            defaultValue={existing?.network_type ?? 'guest'}
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

      <Field label="Label" htmlFor="net-label" hint="What you'd call it on a guest card.">
        <Input
          id="net-label"
          name="label"
          defaultValue={existing?.label ?? ''}
          placeholder="Guest Wi-Fi"
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Network name (SSID)" htmlFor="net-ssid">
          <Input
            id="net-ssid"
            name="ssid"
            defaultValue={existing?.ssid ?? ''}
            placeholder="HotelGuest"
          />
        </Field>
        <Field label="Password" htmlFor="net-password">
          <Input
            id="net-password"
            name="password"
            defaultValue={existing?.password ?? ''}
            placeholder="welcome2024"
          />
        </Field>
      </div>

      <Field label="Band / coverage" htmlFor="net-band" hint="Optional. e.g. '5 GHz' or 'Lobby + rooms 100-150'.">
        <Input
          id="net-band"
          name="band"
          defaultValue={existing?.band ?? ''}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          name="is_shareable"
          defaultChecked={existing?.is_shareable ?? false}
          className="size-4 rounded border-border-default focus-ring"
        />
        <span>OK to share with guests / events</span>
      </label>

      <Field label="Notes" htmlFor="net-notes">
        <textarea
          id="net-notes"
          name="notes"
          defaultValue={existing?.notes ?? ''}
          rows={3}
          className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg shadow-xs focus-ring"
          placeholder="Captive portal, MAC restrictions, who to call if it goes down..."
        />
      </Field>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving...' : existing ? 'Save changes' : 'Add network'}
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
