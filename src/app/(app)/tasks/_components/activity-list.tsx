import type {
  Profile,
  TaskActivity,
  TaskComment,
} from '@/lib/supabase/types'
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from '../_lib/labels'
import { formatDateTime } from '../_lib/time'

type Entry =
  | { kind: 'activity'; row: TaskActivity }
  | { kind: 'comment'; row: TaskComment }

export function ActivityList({
  activity,
  comments,
  profilesById,
}: {
  activity: TaskActivity[]
  comments: TaskComment[]
  profilesById: Map<string, Pick<Profile, 'id' | 'full_name'>>
}) {
  const entries: Entry[] = [
    ...activity.map((row) => ({ kind: 'activity' as const, row })),
    ...comments.map((row) => ({ kind: 'comment' as const, row })),
  ].sort(
    (a, b) =>
      new Date(a.row.created_at).getTime() -
      new Date(b.row.created_at).getTime(),
  )

  if (entries.length === 0) {
    return <p className="text-sm text-muted">No activity yet.</p>
  }

  return (
    <ol className="space-y-3">
      {entries.map((entry) => {
        const actorId =
          entry.kind === 'comment' ? entry.row.author_id : entry.row.actor_id
        const actorEmail =
          entry.kind === 'comment'
            ? entry.row.author_email
            : entry.row.actor_email
        const profile = actorId ? profilesById.get(actorId) : null
        const who = profile?.full_name ?? actorEmail ?? 'Someone'
        return (
          <li
            key={`${entry.kind}-${entry.row.id}`}
            className="flex gap-3 text-sm"
          >
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-border-default" />
            <div className="flex-1 min-w-0">
              <p className="text-fg">
                <span className="font-medium">{who}</span>{' '}
                {entry.kind === 'comment' ? (
                  <span className="text-muted">commented</span>
                ) : (
                  describeActivity(entry.row)
                )}
              </p>
              {entry.kind === 'comment' ? (
                <p className="mt-1 whitespace-pre-wrap text-fg">
                  {entry.row.body}
                </p>
              ) : null}
              <p className="mt-0.5 text-[11px] text-subtle">
                {formatDateTime(entry.row.created_at)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function describeActivity(row: TaskActivity): React.ReactNode {
  switch (row.kind) {
    case 'created':
      return (
        <span className="text-muted">
          created task <span className="font-mono text-fg">{row.to_value}</span>
        </span>
      )
    case 'status':
      return (
        <span className="text-muted">
          moved status from{' '}
          <span className="text-fg">
            {STATUS_LABELS[(row.from_value ?? 'open') as keyof typeof STATUS_LABELS] ??
              row.from_value}
          </span>{' '}
          →{' '}
          <span className="text-fg">
            {STATUS_LABELS[(row.to_value ?? 'open') as keyof typeof STATUS_LABELS] ??
              row.to_value}
          </span>
        </span>
      )
    case 'forced_done':
      return (
        <span className="text-muted">
          marked as <span className="text-fg">Done</span> (owner override)
        </span>
      )
    case 'priority':
      return (
        <span className="text-muted">
          changed priority from{' '}
          <span className="text-fg">
            {PRIORITY_LABELS[
              (row.from_value ?? 'normal') as keyof typeof PRIORITY_LABELS
            ] ?? row.from_value}
          </span>{' '}
          →{' '}
          <span className="text-fg">
            {PRIORITY_LABELS[
              (row.to_value ?? 'normal') as keyof typeof PRIORITY_LABELS
            ] ?? row.to_value}
          </span>
        </span>
      )
    case 'assigned':
      return <span className="text-muted">assigned the task</span>
    case 'unassigned':
      return <span className="text-muted">unassigned the task</span>
    case 'attachment':
      return (
        <span className="text-muted">
          added <span className="text-fg">{row.to_value ?? 'attachment'}</span>{' '}
          evidence
        </span>
      )
    case 'comment':
      return <span className="text-muted">commented</span>
    default:
      return (
        <span className="text-muted">
          updated{' '}
          <span className="text-fg">{row.kind.replace(/_/g, ' ')}</span>
        </span>
      )
  }
  // Categories don't change via activity in v1; left out of the switch
  // intentionally. If the picker lands, add a case.
  void CATEGORY_LABELS
}
