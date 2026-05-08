'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ownerAddPropertyAction, type ActionResult } from '@/lib/admin/actions'

const initial: ActionResult = {}

export function AddPropertyForm() {
  const [state, action, pending] = useActionState(
    ownerAddPropertyAction,
    initial,
  )
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) formRef.current?.reset()
  }, [state.success])

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="add-prop-name">Property name</Label>
        <Input
          id="add-prop-name"
          name="name"
          placeholder="Riverside Inn"
          required
        />
        <p className="text-xs text-subtle">
          You can add the address, logo, and other details after creating it.
        </p>
      </div>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Adding...' : 'Add property'}
      </Button>
    </form>
  )
}
