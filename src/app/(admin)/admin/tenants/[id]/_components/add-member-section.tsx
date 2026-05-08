'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addOrgMemberAction, type ActionResult } from '@/lib/admin/actions'

const initial: ActionResult = {}

export function AddMemberSection({ orgId }: { orgId: string }) {
  const [state, action, pending] = useActionState(addOrgMemberAction, initial)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) formRef.current?.reset()
  }, [state.success])

  return (
    <form
      ref={formRef}
      action={action}
      className="border-t border-border-subtle pt-4 space-y-3"
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

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
        <div className="space-y-1.5">
          <Label htmlFor="member-password">Temporary password</Label>
          <Input
            id="member-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
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
        <Button type="submit" disabled={pending}>
          {pending ? 'Adding...' : 'Add'}
        </Button>
      </div>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}
    </form>
  )
}
