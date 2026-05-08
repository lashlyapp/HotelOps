'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioOption } from '@/components/ui/radio-option'
import { addOrgMemberAction, type ActionResult } from '@/lib/admin/actions'

const initial: ActionResult = {}

export function AddMemberSection({ orgId }: { orgId: string }) {
  const [state, action, pending] = useActionState(addOrgMemberAction, initial)
  const [mode, setMode] = useState<'self' | 'admin'>('self')
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) formRef.current?.reset()
  }, [state.success])

  return (
    <form
      ref={formRef}
      action={action}
      className="border-t border-border-subtle pt-4 space-y-4"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
        Add member
      </p>
      <input type="hidden" name="org_id" value={orgId} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="member-email">Email</Label>
          <Input
            id="member-email"
            name="email"
            type="email"
            placeholder="owner@example.com"
            autoComplete="off"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="member-name">Name (optional)</Label>
          <Input
            id="member-name"
            name="full_name"
            type="text"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="member-role">Role</Label>
        <select
          id="member-role"
          name="role"
          defaultValue="org_owner"
          className="h-9 rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
        >
          <option value="org_owner">Owner</option>
          <option value="org_staff">Staff</option>
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-fg">Password</legend>
        <RadioOption
          id="member-mode-self"
          name="password_mode"
          value="self"
          checked={mode === 'self'}
          onChange={() => setMode('self')}
          label="Let them set their own password"
          hint="Sends a one-time setup link by email."
        />
        <RadioOption
          id="member-mode-admin"
          name="password_mode"
          value="admin"
          checked={mode === 'admin'}
          onChange={() => setMode('admin')}
          label="I'll set a temporary password"
          hint="Share through a secure channel."
        />
      </fieldset>

      {mode === 'admin' ? (
        <div className="space-y-1.5">
          <Label htmlFor="member-password">Temporary password</Label>
          <Input
            id="member-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required={mode === 'admin'}
          />
        </div>
      ) : null}

      {mode === 'admin' ? (
        <Checkbox
          id="member-send-welcome"
          name="send_welcome"
          defaultChecked
          label="Send welcome email"
          hint="Includes a sign-in link only — the password is not included."
        />
      ) : (
        <p className="text-xs text-subtle">
          A welcome email with the setup link will be sent automatically.
        </p>
      )}

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Adding...' : 'Add'}
      </Button>
    </form>
  )
}
