import Link from 'next/link'
import { allPostsIncludingScheduled } from '@/content/blog'
import { Badge } from '@/components/ui/badge'
import { requirePlatformAdmin } from '@/lib/auth/session'

/**
 * Platform-admin view of the blog drip-publish queue. Lists every
 * registered post — live and scheduled — newest first, with a
 * status badge that tells you which are visible to the public,
 * which are queued, and which is publishing today. The "next
 * available slot" hint shows where the next 14-day-cadence date
 * would land if you wrote another draft.
 */
export default async function AdminBlogQueuePage() {
  await requirePlatformAdmin()

  const todayIso = new Date().toISOString().slice(0, 10)
  const sorted = [...allPostsIncludingScheduled].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  )

  const futureCount = sorted.filter((p) => p.publishedAt > todayIso).length
  const publishedCount = sorted.length - futureCount

  // Next available slot = 14 days after the latest known publishedAt.
  const latest = sorted[0]?.publishedAt
  const nextSlot = latest ? addDays(latest, 14) : todayIso

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Blog queue
        </h1>
        <p className="mt-1 text-sm text-muted">
          {publishedCount} live, {futureCount} scheduled. Next open
          slot:{' '}
          <span className="font-mono text-fg">{nextSlot}</span>.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border-subtle">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b border-border-subtle bg-surface-muted/60 text-left text-xs uppercase tracking-wider text-subtle">
            <tr>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Publish date</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Topic</th>
              <th className="px-4 py-3 font-medium text-right">
                Read
              </th>
              <th className="px-4 py-3 font-medium text-right">
                Preview
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {sorted.map((post) => {
              const status = statusFor(post.publishedAt, todayIso)
              const daysOut = daysBetween(todayIso, post.publishedAt)
              return (
                <tr key={post.slug} className="text-fg align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-mono text-xs text-fg">
                      {post.publishedAt}
                    </div>
                    {status !== 'live' ? (
                      <div className="mt-0.5 text-xs text-subtle">
                        {daysOut === 0
                          ? 'today'
                          : daysOut === 1
                            ? 'tomorrow'
                            : `in ${daysOut} days`}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/blog/${post.slug}`}
                      className="font-medium text-fg hover:underline"
                    >
                      {post.title}
                    </Link>
                    <div className="mt-1 text-xs text-subtle">
                      <code>{post.slug}</code>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-subtle">
                    {post.topic}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-subtle">
                    {post.readingMinutes} min
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/admin/blog/${post.slug}`}
                      className="text-xs font-medium text-fg hover:underline"
                    >
                      Preview →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-subtle">
        Posts are date-gated by their <code>publishedAt</code>:
        anything in the future is invisible to <code>/blog</code>,
        the sitemap, and the public detail page. To add a new
        draft for the next slot, run{' '}
        <code>npx tsx scripts/schedule-next-post.ts</code> to
        confirm the date.
      </p>
    </div>
  )
}

type Status = 'live' | 'today' | 'scheduled'

function statusFor(publishedAt: string, todayIso: string): Status {
  if (publishedAt < todayIso) return 'live'
  if (publishedAt === todayIso) return 'today'
  return 'scheduled'
}

function StatusBadge({ status }: { status: Status }) {
  if (status === 'live') return <Badge tone="success">Live</Badge>
  if (status === 'today') return <Badge tone="warning">Today</Badge>
  return <Badge tone="info">Scheduled</Badge>
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`)
  const b = Date.parse(`${toIso}T00:00:00Z`)
  return Math.round((b - a) / (24 * 60 * 60 * 1000))
}
