'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import * as tus from 'tus-js-client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import {
  abortMultipartUploadAction,
  completeMultipartUploadAction,
  finalizeStreamVideoUploadAction,
  initMultipartUploadAction,
  presignUploadAction,
  revalidateAfterUploadAction,
} from '@/lib/media/actions'

const SINGLE_PUT_THRESHOLD = 10 * 1024 * 1024 // 10 MB
// Concurrency tuned around browser per-host connection caps (~6). Worst
// case is 4 large images uploading multipart simultaneously, which is
// FILES_IN_FLIGHT × PARTS_IN_FLIGHT_PER_FILE = 12 in-flight PUTs to R2;
// the browser queues the overflow rather than blowing up.
const FILES_IN_FLIGHT = 4
const PARTS_IN_FLIGHT_PER_FILE = 3

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
  const router = useRouter()

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
    if (contentType.startsWith('video/')) {
      return uploadVideoToStream(file, contentType, jobId, onProgress)
    }
    if (file.size <= SINGLE_PUT_THRESHOLD) {
      return uploadSingle(file, contentType, jobId, onProgress)
    }
    return uploadMultipart(file, contentType, jobId, onProgress)
  }

  /**
   * Videos go to Cloudflare Stream via the tus-resumable Direct Creator
   * Upload flow. tus-js-client uses our /api/media/stream-upload route as
   * the CREATE endpoint (the route adds the Cloudflare API token, mints a
   * Stream upload URL, and inserts the media_videos row); the chunk
   * PATCHes go straight to Cloudflare. Stream handles transcoding,
   * thumbnails, and adaptive playback so the catalog gets a real preview
   * without any client-side frame capture.
   */
  async function uploadVideoToStream(
    file: File,
    _contentType: string,
    jobId: string,
    onProgress: (pct: number) => void,
  ): Promise<boolean> {
    let uid = ''
    try {
      uid = await tusUpload(
        `/api/media/stream-upload?propertyId=${encodeURIComponent(propertyId)}`,
        file,
        onProgress,
      )
    } catch (err) {
      failJob(jobId, err instanceof Error ? err.message : 'Stream upload failed')
      return false
    }

    onProgress(100)
    finishJob(jobId)
    if (uid) {
      // Cloudflare hasn't finished transcoding by the time tus reports
      // success — typical 250 MB clip takes a couple minutes. Poll the
      // finalize action until the row flips to ready (or we hit a hard
      // ceiling) so the catalog can swap "Encoding…" for the thumbnail
      // without the user having to refresh.
      void pollStreamUntilReady(propertyId, uid, () => router.refresh())
    }
    return true
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
                Images up to 2 GB, videos up to 30 GB (Cloudflare Stream).
                Uploads to <span className="text-fg">{propertyName}</span>.
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

/**
 * Poll finalizeStreamVideoUploadAction until Cloudflare finishes encoding,
 * then refresh the catalog so "Encoding…" placeholders swap to thumbnails.
 *
 * Tuned for typical hotel clips: 4 s between polls, ~5 min ceiling. The
 * loop is best-effort — if the user navigates away the unmounted Promise
 * is dropped, and any next visit picks up the (by then) ready row.
 */
async function pollStreamUntilReady(
  propertyId: string,
  uid: string,
  onReady: () => void,
): Promise<void> {
  const POLL_INTERVAL_MS = 4_000
  const MAX_POLLS = 75
  for (let i = 0; i < MAX_POLLS; i += 1) {
    let result
    try {
      result = await finalizeStreamVideoUploadAction({ propertyId, uid })
    } catch {
      return
    }
    if (!result.ok) return
    if (result.status !== 'pending') {
      onReady()
      return
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
}

/**
 * Drive a tus-resumable upload through our /api/media/stream-upload proxy
 * to Cloudflare Stream. tus-js-client makes the initial CREATE against
 * `endpoint`; our route returns the Cloudflare upload URL in `Location`
 * (and the future video UID in `stream-media-id`). tus then PATCHes
 * chunks straight to Cloudflare — that endpoint is browser-CORS-enabled
 * because we minted it with `direct_user=true`. Progress is normalized
 * to 0–99%; the caller stamps 100 after finalize.
 *
 * Resolves with the Stream UID extracted from the create response so the
 * caller can run finalizeStreamVideoUploadAction.
 */
function tusUpload(
  endpoint: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let uid = ''
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
      // Stream requires resumable chunks be multiples of 256 KiB; 50 MiB
      // is what Cloudflare's example uses.
      chunkSize: 50 * 1024 * 1024,
      uploadSize: file.size,
      metadata: { name: file.name, filetype: file.type },
      onError: (err) =>
        reject(err instanceof Error ? err : new Error(String(err))),
      onProgress: (bytesUploaded, bytesTotal) => {
        const pct = Math.round((bytesUploaded / bytesTotal) * 100)
        onProgress(Math.min(pct, 99))
      },
      onAfterResponse: (_req, res) => {
        // Cloudflare echoes the UID on the CREATE response only.
        const header = res.getHeader('stream-media-id')
        if (header) uid = header
      },
      onSuccess: () => resolve(uid),
    })
    upload.start()
  })
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
