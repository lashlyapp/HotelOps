'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Property } from '@/lib/supabase/types'
import {
  broadcastEmergencyAction,
  type ActionResult,
} from '../actions'

export function EmergencyForm({ properties }: { properties: Property[] }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    broadcastEmergencyAction,
    {},
  )
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="property_id">Property</Label>
          <select
            id="property_id"
            name="property_id"
            required
            className="focus-ring h-10 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg"
          >
            <option value="">Choose…</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="minutes">Duration (min)</Label>
          <Input
            id="minutes"
            name="minutes"
            type="number"
            min={1}
            max={240}
            defaultValue={15}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="message">Message</Label>
        <Input
          id="message"
          name="message"
          maxLength={280}
          placeholder="Fire drill — evacuate via Stair B"
          required
        />
      </div>
      {state.error ? (
        <p className="text-sm text-danger-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md bg-success-bg p-2 text-sm text-success-fg">
          {state.success}
        </p>
      ) : null}
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? 'Sending…' : 'Send broadcast'}
      </Button>
    </form>
  )
}
