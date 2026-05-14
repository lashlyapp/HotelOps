'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Property, SignagePlaylist } from '@/lib/supabase/types'
import { savePlaylistAction, type ActionResult } from '../../actions'

export function PlaylistMetaForm({
  properties,
  playlist,
}: {
  properties: Property[]
  playlist?: SignagePlaylist
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    savePlaylistAction,
    {},
  )
  return (
    <form action={action} className="space-y-4">
      {playlist ? (
        <input type="hidden" name="id" value={playlist.id} />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="property_id">Property</Label>
          <select
            id="property_id"
            name="property_id"
            defaultValue={playlist?.property_id ?? properties[0]?.id ?? ''}
            disabled={!!playlist}
            className="focus-ring h-10 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg disabled:opacity-60"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={playlist?.name ?? ''}
            placeholder="Lobby loop, Breakroom bulletin…"
            required
            maxLength={120}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          name="is_default"
          defaultChecked={playlist?.is_default ?? false}
        />
        Make this the default playlist for the property
      </label>
      {state.error ? (
        <p className="text-sm text-danger-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : playlist ? 'Save changes' : 'Create playlist'}
      </Button>
    </form>
  )
}
