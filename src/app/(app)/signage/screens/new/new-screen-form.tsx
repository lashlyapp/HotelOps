'use client'

import Link from 'next/link'
import { useActionState, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Property } from '@/lib/supabase/types'
import {
  startScreenPairingAction,
  type ActionResult,
} from '../../actions'

/**
 * Soft-gate aware. `atCapPropertyIds` lists properties that have hit
 * the base-plan screen cap and the org doesn't have Signage Unlimited
 * on — those options stay in the dropdown but are disabled, with the
 * default selection moving to the first available property. The
 * <UpgradePrompt> rendered upstream is the path to lift the cap.
 */
export function NewScreenForm({
  properties,
  atCapPropertyIds,
  baseLimit,
}: {
  properties: Property[]
  atCapPropertyIds: string[]
  baseLimit: number
}) {
  const atCap = useMemo(
    () => new Set(atCapPropertyIds),
    [atCapPropertyIds],
  )
  const firstAvailable =
    properties.find((p) => !atCap.has(p.id))?.id ?? properties[0]?.id ?? ''
  const [selected, setSelected] = useState(firstAvailable)
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

  const selectedIsAtCap = atCap.has(selected)

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="property_id">Property</Label>
          <select
            id="property_id"
            name="property_id"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="focus-ring h-10 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg"
          >
            {properties.map((p) => {
              const capped = atCap.has(p.id)
              const limitLabel =
                baseLimit === 1
                  ? 'lobby screen used'
                  : `${baseLimit}-screen limit reached`
              return (
                <option key={p.id} value={p.id} disabled={capped}>
                  {p.name}
                  {capped ? ` — ${limitLabel}` : ''}
                </option>
              )
            })}
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
          <Link href="/signage" className="font-medium underline">
            View screens →
          </Link>
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending || selectedIsAtCap}>
          {pending ? 'Creating…' : 'Generate pairing code'}
        </Button>
      </div>
    </form>
  )
}
