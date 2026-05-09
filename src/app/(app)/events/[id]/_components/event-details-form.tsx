'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Event } from '@/lib/supabase/types'
import {
  updateEventDetailsAction,
  type ActionResult,
} from '../../actions'
import { EVENT_TYPE_LABELS, asOptions } from '../../_lib/labels'

const initial: ActionResult = {}

// HTML datetime-local wants "YYYY-MM-DDTHH:MM" in local time.
function toLocalInput(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  const tz = d.getTimezoneOffset()
  const local = new Date(d.getTime() - tz * 60_000)
  return local.toISOString().slice(0, 16)
}

export function EventDetailsForm({ event }: { event: Event }) {
  const [state, action, pending] = useActionState(
    updateEventDetailsAction,
    initial,
  )
  const typeOptions = asOptions(EVENT_TYPE_LABELS)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={event.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="d-name">
          <Input id="d-name" name="name" defaultValue={event.name} required />
        </Field>
        <Field label="Type" htmlFor="d-type">
          <select
            id="d-type"
            name="event_type"
            defaultValue={event.event_type}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start" htmlFor="d-starts">
          <Input
            id="d-starts"
            name="starts_at"
            type="datetime-local"
            defaultValue={toLocalInput(event.starts_at)}
          />
        </Field>
        <Field label="End" htmlFor="d-ends">
          <Input
            id="d-ends"
            name="ends_at"
            type="datetime-local"
            defaultValue={toLocalInput(event.ends_at)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Expected" htmlFor="d-ge">
          <Input
            id="d-ge"
            name="guests_expected"
            type="number"
            min={0}
            defaultValue={event.guests_expected ?? ''}
          />
        </Field>
        <Field label="Guaranteed" htmlFor="d-gg">
          <Input
            id="d-gg"
            name="guests_guaranteed"
            type="number"
            min={0}
            defaultValue={event.guests_guaranteed ?? ''}
          />
        </Field>
        <Field label="Actual" htmlFor="d-ga">
          <Input
            id="d-ga"
            name="guests_actual"
            type="number"
            min={0}
            defaultValue={event.guests_actual ?? ''}
          />
        </Field>
      </div>

      <fieldset className="space-y-4 rounded-md border border-border-subtle p-4">
        <legend className="px-1 text-xs uppercase tracking-wider text-subtle">
          Primary contact
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="d-cname">
            <Input
              id="d-cname"
              name="contact_name"
              defaultValue={event.contact_name ?? ''}
            />
          </Field>
          <Field label="Company" htmlFor="d-ccomp">
            <Input
              id="d-ccomp"
              name="contact_company"
              defaultValue={event.contact_company ?? ''}
            />
          </Field>
          <Field label="Email" htmlFor="d-cemail">
            <Input
              id="d-cemail"
              name="contact_email"
              type="email"
              defaultValue={event.contact_email ?? ''}
            />
          </Field>
          <Field label="Phone" htmlFor="d-cphone">
            <Input
              id="d-cphone"
              name="contact_phone"
              type="tel"
              defaultValue={event.contact_phone ?? ''}
            />
          </Field>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Source" htmlFor="d-source">
          <Input
            id="d-source"
            name="source"
            defaultValue={event.source ?? ''}
          />
        </Field>
        <Field label="Internal notes" htmlFor="d-notes">
          <textarea
            id="d-notes"
            name="internal_notes"
            rows={2}
            defaultValue={event.internal_notes ?? ''}
            className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg shadow-xs focus-ring"
          />
        </Field>
      </div>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving...' : 'Save details'}
      </Button>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
