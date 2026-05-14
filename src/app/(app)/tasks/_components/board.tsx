import { Card } from '@/components/ui/card'
import type { TaskStatus } from '@/lib/supabase/types'
import {
  STATUS_COLUMN_DESCRIPTION,
  STATUS_LABELS,
  STATUS_ORDER,
} from '../_lib/labels'
import { TaskCard, type TaskCardData } from './card'

export function Board({
  groups,
}: {
  groups: Record<TaskStatus, TaskCardData[]>
}) {
  return (
    <div
      className="
        grid gap-4
        sm:grid-cols-2
        lg:grid-cols-4
      "
    >
      {STATUS_ORDER.map((status) => (
        <Column key={status} status={status} items={groups[status] ?? []} />
      ))}
    </div>
  )
}

function Column({
  status,
  items,
}: {
  status: TaskStatus
  items: TaskCardData[]
}) {
  return (
    <section
      aria-labelledby={`tasks-col-${status}`}
      className="flex min-h-0 flex-col"
    >
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <h2
            id={`tasks-col-${status}`}
            className="text-sm font-semibold uppercase tracking-wider text-fg"
          >
            {STATUS_LABELS[status]}
          </h2>
          <p className="mt-0.5 text-xs text-subtle">
            {STATUS_COLUMN_DESCRIPTION[status]}
          </p>
        </div>
        <span className="text-xs font-medium text-muted tabular-nums">
          {items.length}
        </span>
      </header>

      <div className="flex flex-col gap-3">
        {items.length === 0 ? (
          <Card>
            <div className="px-3 py-6 text-center text-xs text-subtle">
              Nothing here.
            </div>
          </Card>
        ) : (
          items.map((data) => <TaskCard key={data.task.id} {...data} />)
        )}
      </div>
    </section>
  )
}
