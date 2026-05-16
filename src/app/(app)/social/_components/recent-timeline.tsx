import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import type { SocialPostLog } from '@/lib/supabase/types'
import { TOPICS, type TopicKey } from '../_lib/topics'

export function RecentTimeline({ rows }: { rows: SocialPostLog[] }) {
  if (rows.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent posts</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {rows.map((row) => {
          const topic = TOPICS[row.topic as TopicKey]
          const first = row.captions[0] ?? ''
          return (
            <div
              key={row.id}
              className="flex items-start justify-between gap-3 border-b border-border-subtle pb-3 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-subtle">
                  {topic?.label ?? row.topic} ·{' '}
                  {new Date(row.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
                <p className="mt-1 truncate text-sm text-fg">{first}</p>
              </div>
              {row.marked_used_at ? (
                <span className="shrink-0 rounded-sm border border-border-subtle bg-surface-muted px-2 py-0.5 text-xs text-muted">
                  Posted
                </span>
              ) : null}
            </div>
          )
        })}
      </CardBody>
    </Card>
  )
}
