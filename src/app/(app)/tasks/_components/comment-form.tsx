'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { addCommentAction, type ActionResult } from '../actions'

export function CommentForm({ taskId }: { taskId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    addCommentAction,
    {},
  )
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success && ref.current) {
      ref.current.reset()
    }
  }, [state.success])

  return (
    <form ref={ref} action={formAction} className="space-y-2">
      <input type="hidden" name="task_id" value={taskId} />
      <textarea
        name="body"
        rows={3}
        maxLength={2000}
        placeholder="Note a part needed, an update, a question…"
        className="focus-ring w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg"
      />
      <div className="flex items-center justify-between gap-2">
        <p
          className="text-xs"
          role={state.error ? 'alert' : undefined}
        >
          {state.error ? (
            <span className="text-danger-fg">{state.error}</span>
          ) : (
            <span className="text-subtle">
              Plain text, up to 2000 characters.
            </span>
          )}
        </p>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Posting…' : 'Post comment'}
        </Button>
      </div>
    </form>
  )
}
