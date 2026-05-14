'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Property } from '@/lib/supabase/types'
import {
  startScreenPairingAction,
  type ActionResult,
} from '../../actions'

export function NewScreenForm({ properties }: { properties: Property[] }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    startScreenPairingAction,
    {},
  )

  if (properties.length === 0) {
    return (
      <p className="text-sm text-muted">
        Add a property first, then come back to pair a screen.
      </p>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="property_id">Property</Label>
          <select
            id="property_id"
            name="property_id"
            defaultValue={properties[0]?.id ?? ''}
            className="focus-ring h-10 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nickname">Screen name</Label>
          <Input
            id="nickname"
            name="nickname"
            placeholder="Lobby TV, Pool deck, Meeting room A…"
            maxLength={80}
            required
          />
        </div>
      </div>

      {state.error ? (
        <p className="text-sm text-danger-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md bg-success-bg p-3 text-sm text-success-fg">
          {state.success}{' '}
          <Link
            href="/signage"
            className="font-medium underline"
          >
            View screens →
          </Link>
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Generate pairing code'}
        </Button>
      </div>
    </form>
  )
}
