'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { changeEmailAction, type ActionResult } from '../actions'

const initial: ActionResult = {}

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, action, pending] = useActionState(changeEmailAction, initial)

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={currentEmail}
          autoComplete="email"
          required
        />
        <p className="text-xs text-subtle">
          Changing this sends a confirmation link to the new address; the
          change only takes effect once you click it.
        </p>
      </div>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}

      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? 'Sending…' : 'Update email'}
      </Button>
    </form>
  )
}
