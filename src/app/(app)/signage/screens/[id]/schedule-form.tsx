'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SignagePlaylist } from '@/lib/supabase/types'
import { saveScheduleAction, type ActionResult } from '../../actions'

export function ScheduleForm({
  screenId,
  playlists,
}: {
  screenId: string
  playlists: SignagePlaylist[]
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    saveScheduleAction,
    {},
  )
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="screen_id" value={screenId} />
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="playlist_id">Playlist</Label>
        <select
          id="playlist_id"
          name="playlist_id"
          required
          className="focus-ring h-10 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg"
        >
          <option value="">Select…</option>
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.is_default ? ' (default)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="priority">Priority</Label>
        <Input
          id="priority"
          name="priority"
          type="number"
          defaultValue={0}
          min={-100}
          max={100}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="starts_on">Starts on</Label>
        <Input id="starts_on" name="starts_on" type="date" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ends_on">Ends on</Label>
        <Input id="ends_on" name="ends_on" type="date" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:col-span-1">
        <div className="space-y-1.5">
          <Label htmlFor="start_time">Start</Label>
          <Input id="start_time" name="start_time" type="time" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end_time">End</Label>
          <Input id="end_time" name="end_time" type="time" />
        </div>
      </div>
      <div className="sm:col-span-3 flex items-center justify-between gap-2">
        <p className="text-xs text-subtle">
          Leave date and time blank for &quot;always&quot;.
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Add schedule'}
        </Button>
      </div>
      {state.error ? (
        <p className="sm:col-span-3 text-xs text-danger-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="sm:col-span-3 text-xs text-success-fg">{state.success}</p>
      ) : null}
    </form>
  )
}
