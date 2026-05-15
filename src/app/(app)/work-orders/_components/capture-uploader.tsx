'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import {
  presignWorkOrderAttachmentAction,
  presignWorkOrderPosterAction,
  type PresignAttachmentResult,
} from '../actions'

const POSTER_TIME_S = 0.33

export type UploadedAttachment = {
  kind: 'photo' | 'video'
  r2Key: string
  posterKey: string | null
  filename: string
  contentType: string
  sizeBytes: number
  previewUrl: string // local Object URL for in-form preview
}

type Slot = {
  id: string
  status: 'uploading' | 'done' | 'error'
  kind: 'photo' | 'video'
  pct: number
  name: string
  error?: string
  attachment?: UploadedAttachment
}

/**
 * Mobile-first capture control. Three obvious actions: take a photo, take a
 * video, pick from library. Browser PUTs the file straight to R2 via the
 * presigned URL — keeps the form payload small (just keys) and bypasses
 * Vercel's 4.5 MB body limit. After a video lands we capture a poster
 * frame in the background and PUT it as a sibling; same pattern as /media.
 */
export function CaptureUploader({
  propertyId,
  workOrderId,
  initial = [],
  onChange,
}: {
  propertyId: string
  workOrderId: string
  initial?: UploadedAttachment[]
  onChange: (uploads: UploadedAttachment[]) => void
}) {
  const [slots, setSlots] = useState<Slot[]>(() =>
    initial.map((a, i) => ({
      id: `init-${i}`,
      status: 'done',
      kind: a.kind,
      pct: 100,
      name: a.filename,
      attachment: a,
    })),
  )
  const photoInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)

  function publish(next: Slot[]) {
    onChange(
      next
        .filter((s): s is Slot & { attachment: UploadedAttachment } =>
          Boolean(s.attachment),
        )
        .map((s) => s.attachment),
    )
  }

  function setSlot(id: string, patch: Partial<Slot>) {
    setSlots((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
      publish(next)
      return next
    })
  }

  function removeSlot(id: string) {
    setSlots((prev) => {
      const next = prev.filter((s) => s.id !== id)
      publish(next)
      return next
    })
  }

  async function ingest(files: FileList | null, hint: 'photo' | 'video' | 'auto') {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    for (const file of list) {
      const kind = inferKind(file, hint)
      if (!kind) {
        const id = crypto.randomUUID()
        setSlots((prev) => {
          const next = [
            ...prev,
            {
              id,
              status: 'error' as const,
              kind: 'photo' as const,
              pct: 0,
              name: file.name,
              error: 'Pick a photo or short video.',
            },
          ]
          publish(next)
          return next
        })
        continue
      }
      const id = crypto.randomUUID()
      setSlots((prev) => [
        ...prev,
        {
          id,
          status: 'uploading',
          kind,
          pct: 0,
          name: file.name,
        },
      ])
      void uploadOne(id, file, kind)
    }
  }

  async function uploadOne(
    slotId: string,
    file: File,
    kind: 'photo' | 'video',
  ) {
    try {
      const presign: PresignAttachmentResult = await presignWorkOrderAttachmentAction({
        propertyId,
        workOrderId,
        filename: file.name,
        contentType: file.type || (kind === 'photo' ? 'image/jpeg' : 'video/mp4'),
        size: file.size,
        kind,
      })
      if (!presign.ok) {
        setSlot(slotId, { status: 'error', error: presign.error })
        return
      }
      await putToR2(presign.url, file, (pct) =>
        setSlot(slotId, { pct, status: 'uploading' }),
      )

      let posterKey: string | null = null
      if (kind === 'video') {
        posterKey = await capturePosterAndUpload(
          file,
          presign.key,
          propertyId,
          workOrderId,
        ).catch((err) => {
          // Don't block the work order on a poster — the player shows the first
          // frame as a fallback. The cover-picker is the v1.1 follow-up.
          console.warn('[work-orders] poster capture failed', err)
          return null
        })
      }

      const attachment: UploadedAttachment = {
        kind,
        r2Key: presign.key,
        posterKey,
        filename: presign.filename,
        contentType: file.type || (kind === 'photo' ? 'image/jpeg' : 'video/mp4'),
        sizeBytes: file.size,
        previewUrl: URL.createObjectURL(file),
      }
      setSlot(slotId, { status: 'done', pct: 100, attachment })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setSlot(slotId, { status: 'error', error: message })
    }
  }

  const done = slots.filter((s) => s.status === 'done').length

  return (
    <div className="space-y-3">
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void ingest(e.target.files, 'photo')
          e.target.value = ''
        }}
      />
      <input
        ref={videoInput}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void ingest(e.target.files, 'video')
          e.target.value = ''
        }}
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void ingest(e.target.files, 'auto')
          e.target.value = ''
        }}
      />

      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        <CaptureButton
          label="Photo"
          onClick={() => photoInput.current?.click()}
          icon={
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <path d="M3 7h3l2-3h8l2 3h3v12H3z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          }
        />
        <CaptureButton
          label="Video"
          onClick={() => videoInput.current?.click()}
          icon={
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <path d="m15 10 6-3v10l-6-3z" />
              <rect x="3" y="6" width="13" height="12" rx="2" />
            </svg>
          }
        />
        <CaptureButton
          label="Library"
          onClick={() => libraryInput.current?.click()}
          icon={
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="8.5" cy="10.5" r="1.5" />
              <path d="m21 17-5-5-9 9" />
            </svg>
          }
        />
      </div>

      <p className="text-xs text-subtle">
        Up to 10 MB per photo, 50 MB per video (≈15 s at 1080p). Take more
        than one — before, during, and after the work.
      </p>

      {slots.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {slots.map((s) => (
            <li
              key={s.id}
              className="relative overflow-hidden rounded-md border border-border-subtle bg-surface-muted"
            >
              <div className="aspect-square relative">
                {s.attachment ? (
                  s.kind === 'photo' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.attachment.previewUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <video
                      src={s.attachment.previewUrl}
                      muted
                      playsInline
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-subtle">
                    {s.status === 'error' ? (
                      <span className="px-2 text-center text-danger-fg">
                        {s.error}
                      </span>
                    ) : (
                      <span>{Math.round(s.pct)}%</span>
                    )}
                  </div>
                )}
                {s.status === 'uploading' ? (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
                    <div
                      className="h-1 bg-primary transition-[width]"
                      style={{ width: `${s.pct}%` }}
                    />
                  </div>
                ) : null}
                {s.status === 'done' ? (
                  <span
                    className={cn(
                      'absolute right-1 top-1 inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium',
                      'bg-black/60 text-white',
                    )}
                  >
                    {s.kind === 'video' ? 'VIDEO' : 'PHOTO'}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="truncate text-[10px] text-muted" title={s.name}>
                  {s.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeSlot(s.id)}
                  className="focus-ring rounded-sm text-[10px] font-medium text-muted hover:text-danger-fg"
                  aria-label={`Remove ${s.name}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {done > 0 ? (
        <p className="text-xs text-success-fg">{done} attached.</p>
      ) : null}
    </div>
  )
}

function CaptureButton({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      onClick={onClick}
      className="flex flex-col items-center gap-1 px-2 py-3 h-auto min-h-[5rem]"
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </Button>
  )
}

function inferKind(
  file: File,
  hint: 'photo' | 'video' | 'auto',
): 'photo' | 'video' | null {
  if (hint === 'photo') {
    return file.type.startsWith('image/') ? 'photo' : null
  }
  if (hint === 'video') {
    return file.type.startsWith('video/') ? 'video' : null
  }
  if (file.type.startsWith('image/')) return 'photo'
  if (file.type.startsWith('video/')) return 'video'
  return null
}

// ----------------------------------------------------------------------------
// Direct R2 upload via the presigned URL. XHR (not fetch) so we get accurate
// progress events for the in-form percent indicator.
// ----------------------------------------------------------------------------
function putToR2(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader(
      'Content-Type',
      file.type || 'application/octet-stream',
    )
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress((e.loaded / e.total) * 100)
      }
    }
    xhr.onerror = () => reject(new Error('Network error during upload.'))
    xhr.ontimeout = () => reject(new Error('Upload timed out.'))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        resolve()
      } else {
        reject(new Error(`Upload failed (${xhr.status}).`))
      }
    }
    xhr.send(file)
  })
}

// ----------------------------------------------------------------------------
// Capture a poster JPEG from the just-uploaded video and PUT it next to the
// video under the work order's _posters/ subprefix. Best-effort — codec-unsupported
// videos (iPhone HEVC on Chrome) silently fall back to "no poster".
// ----------------------------------------------------------------------------
async function capturePosterAndUpload(
  file: File,
  videoKey: string,
  propertyId: string,
  workOrderId: string,
): Promise<string | null> {
  const blob = await captureFirstFrame(file)
  if (!blob) return null
  const presign = await presignWorkOrderPosterAction({
    propertyId,
    workOrderId,
    videoKey,
    size: blob.size,
  })
  if (!presign.ok) return null
  await putToR2(presign.url, new File([blob], 'poster.jpg', { type: 'image/jpeg' }), () => {})
  return presign.posterKey
}

function captureFirstFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = url
    let resolved = false
    const finish = (b: Blob | null) => {
      if (resolved) return
      resolved = true
      URL.revokeObjectURL(url)
      resolve(b)
    }
    const timeout = setTimeout(() => finish(null), 8000)
    video.onloadedmetadata = () => {
      if (!video.videoWidth || !video.videoHeight) {
        clearTimeout(timeout)
        finish(null)
        return
      }
      const target = Math.min(POSTER_TIME_S, (video.duration || 0) * 0.1 || POSTER_TIME_S)
      try {
        video.currentTime = target
      } catch {
        clearTimeout(timeout)
        finish(null)
      }
    }
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        const maxW = 1280
        const scale = video.videoWidth > maxW ? maxW / video.videoWidth : 1
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          clearTimeout(timeout)
          finish(null)
          return
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(
          (b) => {
            clearTimeout(timeout)
            finish(b)
          },
          'image/jpeg',
          0.85,
        )
      } catch {
        clearTimeout(timeout)
        finish(null)
      }
    }
    video.onerror = () => {
      clearTimeout(timeout)
      finish(null)
    }
  })
}
