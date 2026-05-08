'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import {
  abortMultipartUploadAction,
  completeMultipartUploadAction,
  initMultipartUploadAction,
  presignPosterUploadAction,
  presignUploadAction,
  recordPosterAction,
  revalidateAfterUploadAction,
} from '@/lib/media/actions'

const SINGLE_PUT_THRESHOLD = 10 * 1024 * 1024 // 10 MB
const FILES_IN_FLIGHT = 2 // max files uploading concurrently
const PARTS_IN_FLIGHT_PER_FILE = 4 // max parts of a single file in parallel

type Job =
  | { id: string; name: string; size: number; status: 'pending' }
  | { id: string; name: string; size: number; status: 'uploading'; pct: number }
  | { id: string; name: string; size: number; status: 'done' }
  | { id: string; name: string; size: number; status: 'error'; error: string }

export function DropZone({
  propertyId,
  propertySlug,
  propertyName,
}: {
  propertyId: string
  propertySlug: string
  propertyName: string
}) {
  const [over, setOver] = useState(false)
  const [open, setOpen] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFiles() {
    inputRef.current?.click()
  }

  async function handleFiles(files: FileList | File[]) {
    const incoming = Array.from(files)
    if (incoming.length === 0) return

    const newJobs: Job[] = incoming.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      size: f.size,
      status: 'pending',
    }))
    setJobs((prev) => [...prev, ...newJobs])

    const results = await runWithLimit(incoming, FILES_IN_FLIGHT, (file, i) =>
      uploadOne(file, newJobs[i].id, (pct) =>
        updateJob(newJobs[i].id, pct),
      ).catch((err) => {
        // runWithLimit's workers swallow errors otherwise — make sure we
        // always end the job in a visible state.
        const message = err instanceof Error ? err.message : 'Upload failed'
        console.error('[upload]', err)
        failJob(newJobs[i].id, message)
        return false
      }),
    )

    if (results.some(Boolean)) {
      startTransition(async () => {
        await revalidateAfterUploadAction(propertySlug)
      })
    }
  }

  function updateJob(id: string, pct: number) {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id && j.status === 'uploading'
          ? { ...j, pct }
          : j.id === id && j.status === 'pending'
            ? { ...j, status: 'uploading', pct }
            : j,
      ),
    )
  }

  function failJob(id: string, error: string) {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: 'error', error } : j)),
    )
  }

  function finishJob(id: string) {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: 'done' } : j)),
    )
  }

  async function uploadOne(
    file: File,
    jobId: string,
    onProgress: (pct: number) => void,
  ): Promise<boolean> {
    const contentType = file.type || 'application/octet-stream'
    if (file.size <= SINGLE_PUT_THRESHOLD) {
      return uploadSingle(file, contentType, jobId, onProgress)
    }
    return uploadMultipart(file, contentType, jobId, onProgress)
  }

  async function uploadSingle(
    file: File,
    contentType: string,
    jobId: string,
    onProgress: (pct: number) => void,
  ): Promise<boolean> {
    const presign = await presignUploadAction({
      propertyId,
      filename: file.name,
      contentType,
      size: file.size,
    })
    if (!presign.ok) {
      failJob(jobId, presign.error)
      return false
    }
    try {
      await xhrPut(presign.url, file, contentType, onProgress)
      finishJob(jobId)
      if (contentType.startsWith('video/')) {
        await captureAndUploadPoster(file, presign.key)
      }
      return true
    } catch (err) {
      failJob(jobId, err instanceof Error ? err.message : 'Upload failed')
      return false
    }
  }

  async function uploadMultipart(
    file: File,
    contentType: string,
    jobId: string,
    onProgress: (pct: number) => void,
  ): Promise<boolean> {
    const init = await initMultipartUploadAction({
      propertyId,
      filename: file.name,
      contentType,
      size: file.size,
    })
    if (!init.ok) {
      failJob(jobId, init.error)
      return false
    }

    const partCount = init.partUrls.length
    const partProgress = new Array<number>(partCount).fill(0) // bytes uploaded per part
    const partSizes = Array.from({ length: partCount }, (_, i) => {
      const start = i * init.partSize
      const end = Math.min(start + init.partSize, file.size)
      return end - start
    })

    function recomputeOverall() {
      const totalUploaded = partProgress.reduce((a, b) => a + b, 0)
      const pct = Math.round((totalUploaded / file.size) * 100)
      onProgress(Math.min(pct, 99))
    }

    try {
      const parts = await runWithLimit(
        Array.from({ length: partCount }, (_, i) => i),
        PARTS_IN_FLIGHT_PER_FILE,
        async (i) => {
          const start = i * init.partSize
          const end = start + partSizes[i]
          const blob = file.slice(start, end)
          const etag = await xhrPutBlob(
            init.partUrls[i],
            blob,
            contentType,
            (loaded) => {
              partProgress[i] = loaded
              recomputeOverall()
            },
          )
          partProgress[i] = partSizes[i] // ensure full credit on completion
          recomputeOverall()
          return { partNumber: i + 1, etag }
        },
      )

      const complete = await completeMultipartUploadAction({
        propertyId,
        key: init.key,
        uploadId: init.uploadId,
        parts,
      })
      if (!complete.ok) {
        failJob(jobId, complete.error)
        await abortMultipartUploadAction({
          propertyId,
          key: init.key,
          uploadId: init.uploadId,
        })
        return false
      }

      onProgress(100)
      finishJob(jobId)
      if (contentType.startsWith('video/')) {
        await captureAndUploadPoster(file, init.key)
      }
      return true
    } catch (err) {
      failJob(jobId, err instanceof Error ? err.message : 'Upload failed')
      await abortMultipartUploadAction({
        propertyId,
        key: init.key,
        uploadId: init.uploadId,
      })
      return false
    }
  }

  async function captureAndUploadPoster(file: File, videoKey: string) {
    try {
      const blob = await capturePosterBlob(file)
      if (!blob) return

      const presign = await presignPosterUploadAction({
        propertyId,
        videoKey,
        size: blob.size,
      })
      if (!presign.ok) return

      const res = await fetch(presign.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      })
      if (!res.ok) return

      await recordPosterAction({
        propertyId,
        videoKey,
        posterKey: presign.posterKey,
      })
    } catch (err) {
      // Best-effort: a missing poster falls back to <video preload="metadata">
      // on the card, so we don't surface this error to the user.
      console.warn('[poster]', err)
    }
  }

  function clearFinished() {
    setJobs((prev) =>
      prev.filter((j) => j.status !== 'done' && j.status !== 'error'),
    )
  }

  function dismissJob(id: string) {
    setJobs((prev) => prev.filter((j) => j.id !== id))
  }

  return (
    <div className="space-y-2">
      {open ? (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
          }}
          className={cn(
            'rounded-lg border-2 border-dashed transition-colors',
            over
              ? 'border-fg bg-surface-muted'
              : 'border-border-default bg-surface',
          )}
        >
          <div className="p-4 text-center space-y-2">
            <div className="flex items-center justify-between gap-2 text-left">
              <p className="text-xs text-subtle">
                Images and videos up to 2 GB each. Uploads to{' '}
                <span className="text-fg">{propertyName}</span>.
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
              >
                Hide
              </button>
            </div>
            <p className="text-sm text-fg">Drag & drop files here, or</p>
            <Button type="button" variant="secondary" size="sm" onClick={pickFiles}>
              Choose files
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setOpen(true)}
          >
            Upload files
          </Button>
        </div>
      )}

      {jobs.length > 0 ? (
        <div className="rounded-lg border border-border-subtle bg-surface p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
              Uploads
            </p>
            <button
              type="button"
              onClick={clearFinished}
              className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
            >
              Clear
            </button>
          </div>
          <ul className="space-y-2">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} onDismiss={dismissJob} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function JobRow({
  job,
  onDismiss,
}: {
  job: Job
  onDismiss: (id: string) => void
}) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="flex-1 min-w-0 truncate text-fg" title={job.name}>
        {job.name}
      </span>
      <div className="w-32 text-right">
        {job.status === 'pending' ? (
          <span className="text-xs text-subtle">Queued…</span>
        ) : job.status === 'uploading' ? (
          <ProgressBar pct={job.pct} />
        ) : job.status === 'done' ? (
          <span className="text-xs text-success-fg">Done</span>
        ) : (
          <span className="text-xs text-danger-fg" title={job.error}>
            Failed
          </span>
        )}
      </div>
      {job.status === 'done' || job.status === 'error' ? (
        <button
          type="button"
          onClick={() => onDismiss(job.id)}
          aria-label={`Dismiss ${job.name}`}
          className="focus-ring rounded-sm px-1 text-xs text-muted hover:text-fg"
        >
          ×
        </button>
      ) : (
        <span className="w-4" aria-hidden />
      )}
    </li>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-surface-muted overflow-hidden">
        <div
          className="h-full bg-fg transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted tabular-nums w-9 text-right">
        {pct}%
      </span>
    </div>
  )
}

/** Run async tasks with bounded concurrency. */
async function runWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const i = nextIndex++
        if (i >= items.length) return
        results[i] = await fn(items[i], i)
      }
    },
  )
  await Promise.all(workers)
  return results
}

/** PUT a full file via XHR, reporting overall progress as a percentage. */
function xhrPut(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        onProgress(Math.round((evt.loaded / evt.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(body)
  })
}

/**
 * Render the first ~0.1s of a video to a canvas and return a JPEG blob. Used
 * to persist a static poster image alongside each video upload so the catalog
 * card can render <img> instead of <video preload="metadata">.
 */
function capturePosterBlob(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = objectUrl

    const cleanup = () => {
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(objectUrl)
    }

    let settled = false
    const settle = (blob: Blob | null) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(blob)
    }

    // Hard timeout in case metadata never arrives (corrupt file, codec
    // unsupported by the browser, etc.).
    const timeout = setTimeout(() => settle(null), 10_000)

    video.addEventListener('loadeddata', () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          clearTimeout(timeout)
          settle(null)
          return
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(
          (blob) => {
            clearTimeout(timeout)
            settle(blob)
          },
          'image/jpeg',
          0.85,
        )
      } catch {
        clearTimeout(timeout)
        settle(null)
      }
    })
    video.addEventListener('error', () => {
      clearTimeout(timeout)
      settle(null)
    })
  })
}

/**
 * PUT a single multipart part. Reports loaded bytes (not pct) so the parent
 * can sum across parts to compute file-level progress, and resolves with the
 * R2-returned ETag (needed to complete the multipart upload).
 */
function xhrPutBlob(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (loadedBytes: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) onProgress(evt.loaded)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('etag') || xhr.getResponseHeader('ETag')
        if (!etag) {
          // R2 returned the ETag, but the browser can't read it because the
          // bucket's CORS rules don't include "ETag" in ExposeHeaders.
          reject(
            new Error(
              'Cannot read ETag — set R2 bucket CORS to expose the ETag header.',
            ),
          )
          return
        }
        resolve(etag.replace(/"/g, ''))
      } else {
        reject(new Error(`Part upload failed (${xhr.status})`))
      }
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(body)
  })
}
