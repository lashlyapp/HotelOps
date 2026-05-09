'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import type { Event, EventStatus } from '@/lib/supabase/types'
import { changeStatusAction, deleteEventAction } from '../../actions'
import { STATUS_LABELS } from '../../_lib/labels'

// What buttons appear depends on current status. Keeps the UI honest about
// the workflow instead of dumping all statuses into a generic dropdown.
const NEXT_STATES: Record<EventStatus, EventStatus[]> = {
  inquiry: ['tentative', 'lost'],
  tentative: ['proposal_sent', 'definite', 'lost'],
  proposal_sent: ['definite', 'lost'],
  definite: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: ['inquiry'],
  lost: ['inquiry'],
}

export function StatusActions({ event }: { event: Event }) {
  const [pending, startTransition] = useTransition()
  const next = NEXT_STATES[event.status]

  function moveTo(s: EventStatus) {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('id', event.id)
      fd.set('status', s)
      await changeStatusAction(fd)
    })
  }

  function destroy() {
    if (!confirm(`Delete ${event.reference} (${event.name})? This can't be undone.`)) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set('id', event.id)
      await deleteEventAction(fd)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {next.map((s) => (
        <Button
          key={s}
          variant={s === 'cancelled' || s === 'lost' ? 'ghost' : 'secondary'}
          size="sm"
          disabled={pending}
          onClick={() => moveTo(s)}
        >
          Move to {STATUS_LABELS[s].toLowerCase()}
        </Button>
      ))}
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={destroy}
        className="text-danger-fg"
      >
        Delete
      </Button>
    </div>
  )
}
