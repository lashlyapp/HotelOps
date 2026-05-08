'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateOrgNameAction, type ActionResult } from '@/lib/admin/actions'

const initial: ActionResult = {}

export function OrgNameSection({
  orgId,
  initialName,
}: {
  orgId: string
  initialName: string
}) {
  const [state, action, pending] = useActionState(
    updateOrgNameAction,
    initial,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization</CardTitle>
      </CardHeader>
      <CardBody>
        <form action={action} className="space-y-3">
          <input type="hidden" name="org_id" value={orgId} />
          <div className="space-y-1.5">
            <Label htmlFor="org-name">Display name</Label>
            <Input
              id="org-name"
              name="name"
              defaultValue={initialName}
              required
            />
          </div>

          {state.error ? (
            <p className="text-sm text-danger-fg">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-success-fg">{state.success}</p>
          ) : null}

          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Saving...' : 'Save'}
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}
