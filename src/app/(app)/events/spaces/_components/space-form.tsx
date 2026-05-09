'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { EventSpace, Property } from '@/lib/supabase/types'
import { saveSpaceAction, type ActionResult } from '../../actions'

const initial: ActionResult = {}

export function SpaceForm({
  properties,
  existing,
}: {
  properties: Property[]
  existing?: EventSpace
}) {
  const [state, action, pending] = useActionState(saveSpaceAction, initial)
  const defaultPropertyId = existing?.property_id ?? properties[0]?.id ?? ''

  return (
    <form action={action} className="space-y-4">
      {existing ? (
        <input type="hidden" name="id" value={existing.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Property" htmlFor="sp-property">
          <select
            id="sp-property"
            name="property_id"
            defaultValue={defaultPropertyId}
            className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
            required
            disabled={!!existing}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name" htmlFor="sp-name">
          <Input
            id="sp-name"
            name="name"
            defaultValue={existing?.name ?? ''}
            placeholder="Grand Ballroom"
            required
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Seated capacity" htmlFor="sp-cs">
          <Input
            id="sp-cs"
            name="capacity_seated"
            type="number"
            min={0}
            defaultValue={existing?.capacity_seated ?? ''}
          />
        </Field>
        <Field label="Standing capacity" htmlFor="sp-cstand">
          <Input
            id="sp-cstand"
            name="capacity_standing"
            type="number"
            min={0}
            defaultValue={existing?.capacity_standing ?? ''}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Hourly rate ($)"
          htmlFor="sp-hr"
          hint="Optional. Used as a quoting hint, not auto-applied."
        >
          <Input
            id="sp-hr"
            name="hourly_rate"
            type="number"
            min={0}
            step="0.01"
            defaultValue={
              existing?.hourly_rate_cents != null
                ? (existing.hourly_rate_cents / 100).toFixed(2)
                : ''
            }
          />
        </Field>
        <Field label="Flat rate ($)" htmlFor="sp-fr">
          <Input
            id="sp-fr"
            name="flat_rate"
            type="number"
            min={0}
            step="0.01"
            defaultValue={
              existing?.flat_rate_cents != null
                ? (existing.flat_rate_cents / 100).toFixed(2)
                : ''
            }
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="sp-notes">
        <textarea
          id="sp-notes"
          name="notes"
          defaultValue={existing?.notes ?? ''}
          rows={3}
          className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg shadow-xs focus-ring"
          placeholder="Setup styles available, AV included, restrictions..."
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={existing?.is_active ?? true}
          className="size-4 rounded border-border-default focus-ring"
        />
        <span>Bookable</span>
      </label>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving...' : existing ? 'Save changes' : 'Add space'}
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
