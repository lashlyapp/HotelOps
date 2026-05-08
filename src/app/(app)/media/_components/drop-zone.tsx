'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import {
  abortMultipartUploadAction,
  completeMultipartUploadAction,
  initMultipartUploadAction,
  presignPosterUploadAction,
  presignUploadAction,
  revalidateAfterUploadAction,
  setVideoPosterAction,
} from '@/lib/media/actions'
import { CoverPicker, type CoverPickerResult } from './cover-picker'

const SINGLE_PUT_THRESHOLD = 10 * 1024 * 1024 // 10 MB
// Concurrency tuned around browser per-host connection caps (~6). Worst
// case is 4 large images uploading multipart simultaneously, which is
// FILES_IN_FLIGHT × PARTS_IN_FLIGHT_PER_FILE = 12 in-flight PUTs to R2;
// the browser queues the overflow rather than blowing up.
const FILES_IN_FLIGHT = 4
const PARTS_IN_FLIGHT_PER_FILE = 3

type Job =
  | { id: string; name: string; size: number; status: 'pending' }
  | { id: string; name: string; size: number; status: 'awaiting-cover' }
  | { id: string; name: string; size: number; status: 'uploading'; pct: number }
  | { id: string; name: string; size: number; status: 'done' }
  | { id: string; name: string; size: number; status: 'error'; error: string }

type PendingCover = {
  jobId: string
  file: File
  resolve: (cover: CoverPickerResult | null) => void
}

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
  const [coverQueue, setCoverQueue] = useState<PendingCover[]>([])
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  // jobId → R2 key mapping so the video flow can hand the key off to the
  // poster-attach step after the underlying file finishes uploading.
  const videoKeyByJob = useRef(new Map<string, string>())
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
        router.refresh()
      })
    }
  }

  function updateJob(id: string, pct: number) {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== id) return j
        if (j.status === 'uploading') return { ...j, pct }
        if (j.status === 'pending' || j.status === 'awaiting-cover') {
          return { ...j, status: 'uploading', pct }
        }
        return j
      }),
    )
  }

  function setJobStatus(id: string, status: 'pending' | 'awaiting-cover') {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id
          ? ({ id: j.id, name: j.name, size: j.size, status } as Job)
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

  /**
   * Show the cover-picker for a single video. Resolves with the picker's
   * output, or `null` if the user cancelled or the browser couldn't decode
   * the file. Multiple concurrent video uploads queue up — only one picker
   * is mounted at a time.
   */
  function requestCover(jobId: string, file: File): Promise<CoverPickerResult | null> {
    return new Promise((resolve) => {
      setCoverQueue((prev) => [...prev, { jobId, file, resolve }])
    })
  }

  function resolveCover(result: { ok: true; value: CoverPickerResult } | { ok: false }) {
    setCoverQueue((prev) => {
      const [head, ...rest] = prev
      if (head) head.resolve(result.ok ? result.value : null)
      return rest
    })
  }

  async function uploadOne(
    file: File,
    jobId: string,
    onProgress: (pct: number) => void,
  ): Promise<boolean> {
    const contentType = file.type || 'application/octet-stream'
    if (contentType.startsWith('video/')) {
      return uploadVideo(file, contentType, jobId, onProgress)
    }
    if (file.size <= SINGLE_PUT_THRESHOLD) {
      return uploadSingle(file, contentType, jobId, onProgress)
    }
    return uploadMultipart(file, contentType, jobId, onProgress)
  }

  /**
   * Videos: pause for the cover picker first, then upload the video to R2
   * (multipart for anything over 10 MB — which is essentially every video)
   * and the captured JPEG poster in parallel. Both PUTs go directly from
   * the browser to R2 via presigned URLs; we only round-trip through Vercel
   * to mint URLs and to record poster_key in media_metadata at the end.
   */
  async function uploadVideo(
    file: File,
    contentType: string,
    jobId: string,
    onProgress: (pct: number) => void,
  ): Promise<boolean> {
    setJobStatus(jobId, 'awaiting-cover')
    const cover = await requestCover(jobId, file)
    if (!cover) {
      // User cancelled or HEVC-style decode failure. Surface a recoverable
      // error rather than uploading a video with no poster.
      failJob(
        jobId,
        'Cover image required. If your video is HEVC (.mov from iPhone), please export as MP4 first.',
      )
      return false
    }

    setJobStatus(jobId, 'pending')
    const ok =
      file.size <= SINGLE_PUT_THRESHOLD
        ? await uploadSingle(file, contentType, jobId, onProgress)
        : await uploadMultipart(file, contentType, jobId, onProgress)
    if (!ok) return false

    // Find the key the upload landed at. Both uploadSingle/uploadMultipart
    // record it on the job before flipping to "done"; pull it back out so
    // we can attach the poster.
    const videoKey = videoKeyByJob.current.get(jobId)
    if (!videoKey) return true

    try {
      await uploadPoster({
        propertyId,
        videoKey,
        poster: cover.poster,
      })
    } catch (err) {
      // Non-fatal: video is up, just no poster. The catalog will render the
      // video with a generic placeholder until the user re-uploads.
      console.error('[upload] poster attach failed', err)
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
      videoKeyByJob.current.set(jobId, presign.key)
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
      videoKeyByJob.current.set(jobId, init.key)
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

  async function uploadPoster(args: {
    propertyId: string
    videoKey: string
    poster: Blob
  }): Promise<void> {
    const presign = await presignPosterUploadAction({
      propertyId: args.propertyId,
      videoKey: args.videoKey,
      size: args.poster.size,
    })
    if (!presign.ok) throw new Error(presign.error)
    await xhrPut(presign.url, args.poster, 'image/jpeg', () => {})
    const result = await setVideoPosterAction({
      propertyId: args.propertyId,
      videoKey: args.videoKey,
      posterKey: presign.posterKey,
    })
    if (!result.ok) throw new Error(result.error)
  }

  function clearFinished() {
    setJobs((prev) =>
      prev.filter((j) => j.status !== 'done' && j.status !== 'error'),
    )
  }

  function dismissJob(id: string) {
    setJobs((prev) => prev.filter((j) => j.id !== id))
  }

  const activeCover = coverQueue[0] ?? null

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
                Images and videos up to 5 GB. Videos prompt for a cover image
                after upload starts. Uploads to{' '}
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

      {activeCover ? (
        <CoverPicker
          key={activeCover.jobId}
          file={activeCover.file}
          onResolve={(result) => {
            if (result.ok) {
              resolveCover({ ok: true, value: result.value })
            } else {
              resolveCover({ ok: false })
            }
          }}
        />
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
      <div className="w-40 text-right">
        {job.status === 'pending' ? (
          <span className="text-xs text-subtle">Queued…</span>
        ) : job.status === 'awaiting-cover' ? (
          <span className="text-xs text-subtle">Pick cover…</span>
        ) : job.status === 'uploading' ? (
          <ProgressBar pct={job.pct} />
        ) : job.status === 'done' ? (
          <span className="text-xs text-success-fg">Done</span>
        ) : (
          <span className="text-xs text-danger-fg" title={job.error}>
            {job.error.length > 30 ? 'Failed' : job.error}
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
