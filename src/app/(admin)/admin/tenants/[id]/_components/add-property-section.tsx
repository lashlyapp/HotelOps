'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addPropertyAction, type ActionResult } from '@/lib/admin/actions'

const initial: ActionResult = {}

export function AddPropertySection({
  orgId,
  orgSlug,
}: {
  orgId: string
  orgSlug: string
}) {
  const [state, action, pending] = useActionState(addPropertyAction, initial)
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
        Add property
      </p>
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="org_slug" value={orgSlug} />

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <div className="space-y-1.5">
          <Label htmlFor="prop-slug">Slug</Label>
          <Input
            id="prop-slug"
            name="slug"
            placeholder="cupertino-hotel"
            pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prop-name">Name</Label>
          <Input
            id="prop-name"
            name="name"
            placeholder="Cupertino Hotel"
            required
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
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
