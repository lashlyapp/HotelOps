'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createTeamMemberAction, type ActionResult } from '@/lib/admin/actions'

const initial: ActionResult = {}

export function AddMemberForm() {
  const [state, action, pending] = useActionState(
    createTeamMemberAction,
    initial,
  )
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

          <div className="space-y-1.5">
            <Label htmlFor="password">Temporary password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <p className="text-xs text-subtle">
              At least 8 characters. Share with the new member; they can change
              it from their account page.
            </p>
          </div>

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
