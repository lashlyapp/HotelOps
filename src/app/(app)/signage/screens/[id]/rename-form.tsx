'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { renameScreenAction, type ActionResult } from '../../actions'

export function RenameScreenForm({
  id,
  initial,
}: {
  id: string
  initial: string
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    renameScreenAction,
    {},
  )
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="id" value={id} />
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="nickname">Nickname</Label>
        <Input
          id="nickname"
          name="nickname"
          defaultValue={initial}
          required
          maxLength={80}
        />
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? 'Saving…' : 'Rename'}
      </Button>
      {state.error ? (
        <p className="text-xs text-danger-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-xs text-success-fg">{state.success}</p>
      ) : null}
    </form>
  )
}
