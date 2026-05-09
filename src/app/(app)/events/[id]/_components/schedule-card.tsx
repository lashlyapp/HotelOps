'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type {
  Event,
  EventScheduleBlock,
  EventSpace,
} from '@/lib/supabase/types'
import {
  addScheduleBlockAction,
  deleteScheduleBlockAction,
  type ActionResult,
} from '../../actions'

const initial: ActionResult = {}

function fmt(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function toLocalInput(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  const tz = d.getTimezoneOffset()
  return new Date(d.getTime() - tz * 60_000).toISOString().slice(0, 16)
}

export function ScheduleCard({
  event,
  blocks,
  spaces,
}: {
  event: Event
  blocks: EventScheduleBlock[]
  spaces: EventSpace[]
}) {
  const [state, action, pending] = useActionState(
    addScheduleBlockAction,
    initial,
  )
  const spaceById = new Map(spaces.map((s) => [s.id, s]))
  const activeSpaces = spaces.filter((s) => s.is_active)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule &amp; spaces</CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        {blocks.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">
            No timeline blocks yet. Add one for each segment of the day —
            ceremony, cocktails, dinner.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {blocks.map((b) => {
              const space = b.space_id ? spaceById.get(b.space_id) : null
              return (
                <li
                  key={b.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-fg">{b.label}</p>
                    <p className="mt-0.5 text-xs text-subtle">
                      {fmt(b.starts_at)} → {fmt(b.ends_at)}
                      {space ? ` · ${space.name}` : ''}
                      {b.setup_style ? ` · ${b.setup_style}` : ''}
                    </p>
                    {b.notes ? (
                      <p className="mt-1 text-xs text-muted whitespace-pre-wrap">
                        {b.notes}
                      </p>
                    ) : null}
                  </div>
                  <form action={deleteScheduleBlockAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="event_id" value={event.id} />
                    <button
                      type="submit"
                      className="focus-ring rounded-sm text-xs text-muted hover:text-danger-fg"
                    >
                      Remove
                    </button>
                  </form>
                </li>
              )
            })}
          </ul>
        )}

        <div className="border-t border-border-subtle p-5">
          <p className="text-xs uppercase tracking-wider text-subtle mb-3">
            Add timeline block
          </p>
          {activeSpaces.length === 0 ? (
            <p className="text-sm text-muted">
              Add a space first under{' '}
              <Link href="/events/spaces" className="underline focus-ring">
                Spaces
              </Link>
              , or leave the space blank if it&apos;s offsite catering.
            </p>
          ) : null}
          <form action={action} className="space-y-3 mt-2">
            <input type="hidden" name="event_id" value={event.id} />
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <div className="space-y-1.5">
                <Label htmlFor="sb-label">Label</Label>
                <Input
                  id="sb-label"
                  name="label"
                  placeholder="Ceremony"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sb-space">Space</Label>
                <select
                  id="sb-space"
                  name="space_id"
                  className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
                >
                  <option value="">— No space —</option>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sb-start">Start</Label>
                <Input
                  id="sb-start"
                  name="starts_at"
                  type="datetime-local"
                  defaultValue={toLocalInput(event.starts_at)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sb-end">End</Label>
                <Input
                  id="sb-end"
                  name="ends_at"
                  type="datetime-local"
                  defaultValue={toLocalInput(event.ends_at)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-setup">Setup</Label>
              <Input
                id="sb-setup"
                name="setup_style"
                placeholder="Rounds of 10, theater, U-shape..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-notes">Notes</Label>
              <textarea
                id="sb-notes"
                name="notes"
                rows={2}
                className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg shadow-xs focus-ring"
              />
            </div>

            {state.error ? (
              <p className="text-sm text-danger-fg">{state.error}</p>
            ) : null}

            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Adding...' : 'Add block'}
            </Button>
          </form>
        </div>
      </CardBody>
    </Card>
  )
}
