import Image from 'next/image'
import { r2PublicUrl } from '@/lib/r2/client'
import type {
  WorkOrderAttachment,
  WorkOrderAttachmentPhase,
} from '@/lib/supabase/types'
import { deleteAttachmentAction } from '../actions'
import { formatDateTime } from '../_lib/time'

const PHASE_LABELS: Record<WorkOrderAttachmentPhase, string> = {
  before: 'Before',
  progress: 'Progress',
  after: 'After',
}

export function Gallery({
  attachments,
  canDelete,
}: {
  attachments: WorkOrderAttachment[]
  canDelete: boolean
}) {
  if (attachments.length === 0) {
    return (
      <p className="text-sm text-muted">
        No photos or videos yet. The capture form below records evidence
        directly to the work order.
      </p>
    )
  }

  const grouped: Record<WorkOrderAttachmentPhase, WorkOrderAttachment[]> = {
    before: [],
    progress: [],
    after: [],
  }
  for (const a of attachments) grouped[a.phase].push(a)

  return (
    <div className="space-y-5">
      {(['before', 'progress', 'after'] as WorkOrderAttachmentPhase[]).map((phase) =>
        grouped[phase].length === 0 ? null : (
          <section key={phase} className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-subtle">
              {PHASE_LABELS[phase]} ({grouped[phase].length})
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {grouped[phase].map((att) => (
                <Item key={att.id} att={att} canDelete={canDelete} />
              ))}
            </div>
          </section>
        ),
      )}
    </div>
  )
}

function Item({
  att,
  canDelete,
}: {
  att: WorkOrderAttachment
  canDelete: boolean
}) {
  const url = r2PublicUrl(att.r2_key)
  const posterUrl = att.poster_key ? r2PublicUrl(att.poster_key) : null
  return (
    <figure className="group relative overflow-hidden rounded-md border border-border-subtle bg-surface-muted">
      <div className="aspect-square relative">
        {att.kind === 'video' ? (
          <video
            src={url}
            poster={posterUrl ?? undefined}
            controls
            preload="metadata"
            playsInline
            className="absolute inset-0 h-full w-full object-cover bg-black"
          />
        ) : (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Image
              src={url}
              alt={att.caption ?? att.filename}
              fill
              sizes="(min-width: 1024px) 16rem, 50vw"
              className="object-cover"
              unoptimized
            />
          </a>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-2 px-2 py-1.5">
        <span className="truncate text-[10px] text-muted" title={att.filename}>
          {formatDateTime(att.created_at)}
        </span>
        {canDelete ? (
          <form action={deleteAttachmentAction}>
            <input type="hidden" name="id" value={att.id} />
            <button
              type="submit"
              className="focus-ring rounded-sm text-[10px] font-medium text-muted hover:text-danger-fg"
              aria-label={`Remove ${att.filename}`}
            >
              Remove
            </button>
          </form>
        ) : null}
      </figcaption>
    </figure>
  )
}
