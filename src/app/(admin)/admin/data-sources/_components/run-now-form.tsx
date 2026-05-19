'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { runDataSourceNowAction, type ActionResult } from '../actions'

const initial: ActionResult = {}

export function RunNowForm({ source, runnable }: { source: string; runnable: boolean }) {
  const [state, action, pending] = useActionState(runDataSourceNowAction, initial)
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="source" value={source} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={pending || !runnable}
        title={runnable ? '' : 'Adapter not implemented yet'}
      >
        {pending ? 'Running…' : 'Run now'}
      </Button>
      {state.error ? <p className="text-[10px] text-danger-fg">{state.error}</p> : null}
      {state.success ? <p className="text-[10px] text-muted">{state.success}</p> : null}
    </form>
  )
}
