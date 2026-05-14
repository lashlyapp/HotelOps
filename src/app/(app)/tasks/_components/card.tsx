import Image from 'next/image'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { r2PublicUrl } from '@/lib/r2/client'
import type {
  Property,
  Task,
  TaskAttachment,
} from '@/lib/supabase/types'
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  PRIORITY_TONE,
} from '../_lib/labels'
import { formatAge } from '../_lib/time'

export type TaskCardData = {
  task: Task
  attachments: TaskAttachment[]
  property?: Property
  assigneeLabel?: string | null
  commentCount?: number
}

/**
 * Compact Kanban card. The first attachment thumbnail is the headline —
 * staff identify what's wrong by glancing at the photo, not by reading
 * a title. Falls back to a category-tinted placeholder if no media was
 * attached, with a small warning glyph nudging the user to upload proof.
 */
export function TaskCard({
  task,
  attachments,
  property,
  assigneeLabel,
  commentCount,
}: TaskCardData) {
  const first = pickThumbAttachment(attachments)
  const thumbUrl = first
    ? (first.poster_key ? r2PublicUrl(first.poster_key) : r2PublicUrl(first.r2_key))
    : null
  const isVideo = first?.kind === 'video'
  const initials = assigneeLabel ? initialsFor(assigneeLabel) : null

  return (
    <Link
      href={`/tasks/${task.id}`}
      className="focus-ring block overflow-hidden rounded-md border border-border-subtle bg-surface hover:border-border-default"
    >
      <div className="aspect-[4/3] relative w-full overflow-hidden bg-surface-muted">
        {thumbUrl ? (
          <Image
            src={thumbUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 16rem, 100vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-subtle">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="8.5" cy="10.5" r="1.5" />
              <path d="m21 17-5-5-9 9" />
            </svg>
            <span className="text-[10px] uppercase tracking-wider">
              No photo yet
            </span>
          </div>
        )}
        {isVideo ? (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-sm bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <svg
              aria-hidden
              viewBox="0 0 12 12"
              className="h-2.5 w-2.5"
              fill="currentColor"
            >
              <path d="M3 2v8l7-4z" />
            </svg>
            VIDEO
          </span>
        ) : null}
        <span className="absolute left-1.5 top-1.5">
          <Badge tone={PRIORITY_TONE[task.priority]}>
            {PRIORITY_LABELS[task.priority]}
          </Badge>
        </span>
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium leading-snug text-fg line-clamp-2">
            {task.title}
          </h3>
          <span className="shrink-0 text-[10px] font-mono uppercase text-subtle">
            {task.reference}
          </span>
        </div>
        <div className="text-xs text-muted">
          {CATEGORY_LABELS[task.category]}
          {task.location ? <> · {task.location}</> : null}
          {property ? <> · {property.name}</> : null}
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-subtle">
          <div className="flex items-center gap-2">
            {initials ? (
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-muted px-1 text-[10px] font-medium text-fg"
                title={assigneeLabel ?? ''}
              >
                {initials}
              </span>
            ) : (
              <span className="text-subtle">Unassigned</span>
            )}
            {commentCount && commentCount > 0 ? (
              <span className="inline-flex items-center gap-0.5">
                <svg
                  aria-hidden
                  viewBox="0 0 12 12"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M2 3h8v5H6l-3 2V8H2z" />
                </svg>
                {commentCount}
              </span>
            ) : null}
          </div>
          <span>{formatAge(task.created_at)}</span>
        </div>
      </div>
    </Link>
  )
}

function pickThumbAttachment(
  attachments: TaskAttachment[],
): TaskAttachment | undefined {
  if (attachments.length === 0) return undefined
  // Prefer the earliest 'before' photo so the headline image matches what
  // the reporter saw. Falls back to the earliest of anything.
  const sorted = [...attachments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  return sorted.find((a) => a.phase === 'before') ?? sorted[0]
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}
