'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Property } from '@/lib/supabase/types'
import { createEventAction, type ActionResult } from '../../actions'
import { EVENT_TYPE_LABELS, asOptions } from '../../_lib/labels'

const initial: ActionResult = {}

export function NewEventForm({ properties }: { properties: Property[] }) {
  const [state, action, pending] = useActionState(createEventAction, initial)
  const typeOptions = asOptions(EVENT_TYPE_LABELS)

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event name" htmlFor="ev-name">
          <Input
            id="ev-name"
            name="name"
            placeholder="Smith / Patel wedding"
            required
          />
        </Field>
        <Field label="Type" htmlFor="ev-type">
          <select
            id="ev-type"
            name="event_type"
            defaultValue="wedding"
            className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
            required
          >
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Property" htmlFor="ev-property">
        <select
          id="ev-property"
          name="property_id"
          defaultValue={properties[0]?.id ?? ''}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start" htmlFor="ev-starts">
          <Input id="ev-starts" name="starts_at" type="datetime-local" />
        </Field>
        <Field label="End" htmlFor="ev-ends">
          <Input id="ev-ends" name="ends_at" type="datetime-local" />
        </Field>
      </div>

      <Field
        label="Expected guests"
        htmlFor="ev-guests"
        hint="Best guess for now — you can lock in a guarantee later."
      >
        <Input id="ev-guests" name="guests_expected" type="number" min={0} />
      </Field>

      <fieldset className="space-y-4 rounded-md border border-border-subtle p-4">
        <legend className="px-1 text-xs uppercase tracking-wider text-subtle">
          Primary contact
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="ev-cname">
            <Input id="ev-cname" name="contact_name" />
          </Field>
          <Field label="Company / org" htmlFor="ev-ccomp">
            <Input id="ev-ccomp" name="contact_company" />
          </Field>
          <Field label="Email" htmlFor="ev-cemail">
            <Input id="ev-cemail" name="contact_email" type="email" />
          </Field>
          <Field label="Phone" htmlFor="ev-cphone">
            <Input id="ev-cphone" name="contact_phone" type="tel" />
          </Field>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Source"
          htmlFor="ev-source"
          hint="How did they find us? Optional."
        >
          <Input
            id="ev-source"
            name="source"
            placeholder="Referral, website, walk-in..."
          />
        </Field>
        <Field label="Internal notes" htmlFor="ev-notes">
          <textarea
            id="ev-notes"
            name="internal_notes"
            rows={2}
            className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg shadow-xs focus-ring"
            placeholder="Anything the next person should know."
          />
        </Field>
      </div>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving...' : 'Create event'}
        </Button>
        <p className="text-xs text-subtle">
          Goes in as an inquiry — no client communication is sent.
        </p>
      </div>
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
