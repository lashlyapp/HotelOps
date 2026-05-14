'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import type {
  Profile,
  TaskPriority,
  TaskStatus,
} from '@/lib/supabase/types'
import {
  changeAssigneeAction,
  changePriorityAction,
  changeStatusAction,
  type ActionResult,
} from '../actions'
import {
  PRIORITIES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
} from '../_lib/labels'

export function StatusControls({
  taskId,
  status,
  priority,
  assigneeId,
  assignees,
  isOwner,
  hasAfterEvidence,
}: {
  taskId: string
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string | null
  assignees: Pick<Profile, 'id' | 'full_name'>[]
  isOwner: boolean
  hasAfterEvidence: boolean
}) {
  return (
    <div className="space-y-3">
      <StatusForm
        taskId={taskId}
        status={status}
        isOwner={isOwner}
        hasAfterEvidence={hasAfterEvidence}
      />
      <PriorityForm taskId={taskId} priority={priority} />
      <AssigneeForm
        taskId={taskId}
        assigneeId={assigneeId}
        assignees={assignees}
      />
    </div>
  )
}

function StatusForm({
  taskId,
  status,
  isOwner,
  hasAfterEvidence,
}: {
  taskId: string
  status: TaskStatus
  isOwner: boolean
  hasAfterEvidence: boolean
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    changeStatusAction,
    {},
  )
  return (
    <form action={action} className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wider text-subtle">
        Status
      </label>
      <input type="hidden" name="task_id" value={taskId} />
      <select
        name="status"
        defaultValue={status}
        className="focus-ring h-9 w-full rounded-md border border-border-default bg-surface px-2 text-sm text-fg"
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {!hasAfterEvidence ? (
        <p className="text-[11px] text-subtle">
          Marking done needs an &quot;after&quot; photo. Upload one below.
        </p>
      ) : null}
      {isOwner && !hasAfterEvidence ? (
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          <input type="checkbox" name="force" value="1" /> Override (owner)
        </label>
      ) : null}
      <ActionMessage state={state} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Update status'}
      </Button>
    </form>
  )
}

function PriorityForm({
  taskId,
  priority,
}: {
  taskId: string
  priority: TaskPriority
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    changePriorityAction,
    {},
  )
  return (
    <form action={action} className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wider text-subtle">
        Priority
      </label>
      <input type="hidden" name="task_id" value={taskId} />
      <select
        name="priority"
        defaultValue={priority}
        className="focus-ring h-9 w-full rounded-md border border-border-default bg-surface px-2 text-sm text-fg"
      >
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABELS[p]}
          </option>
        ))}
      </select>
      <ActionMessage state={state} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Saving…' : 'Update priority'}
      </Button>
    </form>
  )
}

function AssigneeForm({
  taskId,
  assigneeId,
  assignees,
}: {
  taskId: string
  assigneeId: string | null
  assignees: Pick<Profile, 'id' | 'full_name'>[]
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    changeAssigneeAction,
    {},
  )
  return (
    <form action={action} className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wider text-subtle">
        Assignee
      </label>
      <input type="hidden" name="task_id" value={taskId} />
      <select
        name="assignee_id"
        defaultValue={assigneeId ?? ''}
        className="focus-ring h-9 w-full rounded-md border border-border-default bg-surface px-2 text-sm text-fg"
      >
        <option value="">Unassigned</option>
        {assignees.map((a) => (
          <option key={a.id} value={a.id}>
            {a.full_name ?? a.id.slice(0, 8)}
          </option>
        ))}
      </select>
      <ActionMessage state={state} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Saving…' : 'Update assignee'}
      </Button>
    </form>
  )
}

function ActionMessage({ state }: { state: ActionResult }) {
  if (!state.error && !state.success) return null
  return (
    <p
      className={
        state.error
          ? 'text-[11px] text-danger-fg'
          : 'text-[11px] text-success-fg'
      }
      role={state.error ? 'alert' : undefined}
    >
      {state.error ?? state.success}
    </p>
  )
}
