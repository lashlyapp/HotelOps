'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createTeamMemberAction, type ActionResult } from '@/lib/admin/actions'

const initial: ActionResult = {}

export function AddMemberForm() {
  const [state, action, pending] = useActionState(
    createTeamMemberAction,
    initial,
  )
  const [mode, setMode] = useState<'self' | 'admin'>('self')
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) formRef.current?.reset()
  }, [state.success])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add team member</CardTitle>
      </CardHeader>
      <CardBody>
        <form ref={formRef} action={action} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="manager@hotel.com"
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Name (optional)</Label>
              <Input
                id="full_name"
                name="full_name"
                type="text"
                placeholder="Maria Lopez"
                autoComplete="off"
              />
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fg">Password</legend>
            <ModeRadio
              id="mode-self"
              value="self"
              checked={mode === 'self'}
              onChange={() => setMode('self')}
              label="Let them set their own password"
              hint="Sends a one-time setup link by email. Recommended."
            />
            <ModeRadio
              id="mode-admin"
              value="admin"
              checked={mode === 'admin'}
              onChange={() => setMode('admin')}
              label="I'll set a temporary password"
              hint="Share it with them through a secure channel."
            />
          </fieldset>

          {mode === 'admin' ? (
            <div className="space-y-1.5">
              <Label htmlFor="password">Temporary password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required={mode === 'admin'}
              />
              <p className="text-xs text-subtle">At least 8 characters.</p>
            </div>
          ) : null}

          {mode === 'admin' ? (
            <Checkbox
              id="send_welcome"
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
            {pending ? 'Adding...' : 'Add member'}
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

function ModeRadio({
  id,
  value,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string
  value: 'self' | 'admin'
  checked: boolean
  onChange: () => void
  label: string
  hint: string
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-2.5 cursor-pointer select-none"
    >
      <input
        id={id}
        type="radio"
        name="password_mode"
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-4 shrink-0 accent-fg focus-ring"
      />
      <span>
        <span className="block text-sm text-fg">{label}</span>
        <span className="block text-xs text-subtle">{hint}</span>
      </span>
    </label>
  )
}
