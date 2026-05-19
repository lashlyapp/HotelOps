'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { refreshMarketAction, type ActionResult } from '../actions'

const initial: ActionResult = {}

export function RefreshForm({ propertyId }: { propertyId: string }) {
  const [state, action, pending] = useActionState(refreshMarketAction, initial)
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="property_id" value={propertyId} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? 'Refreshing…' : 'Refresh insights'}
      </Button>
      {state.error ? (
        <p className="text-xs text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-xs text-muted">{state.success}</p>
      ) : null}
    </form>
  )
}
