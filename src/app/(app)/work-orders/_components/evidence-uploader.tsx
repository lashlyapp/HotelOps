'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import type { WorkOrderAttachmentPhase } from '@/lib/supabase/types'
import { addEvidenceAction } from '../actions'
import {
  CaptureUploader,
  type UploadedAttachment,
} from './capture-uploader'

const PHASE_LABELS: Record<WorkOrderAttachmentPhase, string> = {
  before: 'Before',
  progress: 'Progress',
  after: 'After',
}
const PHASE_HELP: Record<WorkOrderAttachmentPhase, string> = {
  before:
    'Initial state. Add this if the original photos missed something.',
  progress:
    'Work in progress — useful when waiting on parts or handing off shift.',
  after:
    'Proof of completion. Required to mark the work order done.',
}

export function EvidenceUploader({
  workOrderId,
  propertyId,
  initialPhase = 'after',
}: {
  workOrderId: string
  propertyId: string
  initialPhase?: WorkOrderAttachmentPhase
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<WorkOrderAttachmentPhase>(initialPhase)
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (attachments.length === 0) {
      setError('Take a photo or video first.')
      return
    }
    startTransition(async () => {
      const result = await addEvidenceAction({
        workOrderId,
        phase,
        attachments: attachments.map((a) => ({
          kind: a.kind,
          r2Key: a.r2Key,
          posterKey: a.posterKey,
          filename: a.filename,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
        })),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setAttachments([])
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex flex-wrap gap-1 text-sm">
        {(['before', 'progress', 'after'] as WorkOrderAttachmentPhase[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p)}
            aria-pressed={phase === p}
            className={
              phase === p
                ? 'focus-ring rounded-md bg-surface-muted px-3 py-1.5 font-medium text-fg'
                : 'focus-ring rounded-md px-3 py-1.5 text-muted hover:bg-surface-muted hover:text-fg'
            }
          >
            {PHASE_LABELS[p]}
          </button>
        ))}
      </div>

      <p className="text-xs text-subtle">{PHASE_HELP[phase]}</p>

      <CaptureUploader
        propertyId={propertyId}
        workOrderId={workOrderId}
        onChange={setAttachments}
      />

      {error ? (
        <p className="text-sm text-danger-fg" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || attachments.length === 0}>
        {pending ? 'Saving…' : `Add ${PHASE_LABELS[phase].toLowerCase()} evidence`}
      </Button>
    </form>
  )
}
