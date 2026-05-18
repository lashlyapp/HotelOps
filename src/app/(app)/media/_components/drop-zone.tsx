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
  scheduleMediaVisionTagAction,
  setVideoPosterAction,
} from '@/lib/media/actions'

const SINGLE_PUT_THRESHOLD = 10 * 1024 * 1024 // 10 MB
// Frame to grab as the auto-poster on upload. ~0.33s ≈ frame 10 at 30 fps,
// which is far enough into the video to skip the typical fade-in-from-black
// opener but early enough to feel like "the start" of the clip.
const DEFAULT_POSTER_TIME_S = 0.33
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

    // Track videos whose in-memory auto-poster didn't land — typically a
    // transient PUT failure or the occasional blob-URL decode hiccup. We
    // retry these from R2 once the batch settles (see retryMissingPosters).
    const posterRetryQueue: string[] = []
    const onPosterFailure = (videoKey: string) => {
      posterRetryQueue.push(videoKey)
    }

    const results = await runWithLimit(incoming, FILES_IN_FLIGHT, (file, i) =>
      uploadOne(file, newJobs[i].id, (pct) =>
        updateJob(newJobs[i].id, pct), onPosterFailure,
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
        await revalidateAfterUploadAction({ propertySlug, propertyId })
        router.refresh()
      })
    }

    // Non-blocking second pass: now that uploads are done and R2 has the
    // video objects, try once more for any whose in-memory capture failed.
    // This catches transient failures (network hiccup on the poster PUT,
    // tab throttling mid-decode); genuine codec problems like HEVC .mov on
    // Chrome will still fail, and the user can pick a cover manually from
    // the preview dialog.
    if (posterRetryQueue.length > 0) {
      void retryMissingPosters(posterRetryQueue)
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

  /**
   * Both images and videos take the same R2 path: single PUT under 10 MB,
   * multipart above. After a video lands we grab a default cover frame in
   * the background (~0.33s in to skip fade-in-from-black) and PUT it as a
   * sibling poster — fire-and-forget, so a batch of N videos isn't gated on
   * N modal pickers. The user can swap the cover later from the preview
   * dialog (Facebook/Instagram-style "Change cover").
   */
  async function uploadOne(
    file: File,
    jobId: string,
    onProgress: (pct: number) => void,
    onPosterFailure: (videoKey: string) => void,
  ): Promise<boolean> {
    const contentType = file.type || 'application/octet-stream'
    const result =
      file.size <= SINGLE_PUT_THRESHOLD
        ? await uploadSingle(file, contentType, jobId, onProgress)
        : await uploadMultipart(file, contentType, jobId, onProgress)
    if (result.ok && contentType.startsWith('video/')) {
      const videoKey = result.key
      void attachDefaultPoster(file, videoKey)
        .then((posterOk) => {
          if (!posterOk) onPosterFailure(videoKey)
        })
        .catch((err) => {
          // Non-fatal — the video is up, the catalog just shows a placeholder
          // until the user picks a cover manually.
          console.warn('[upload] default poster capture failed', err)
          onPosterFailure(videoKey)
        })
    }
    if (result.ok && contentType.startsWith('image/')) {
      // Fire-and-forget: tells the server to run the OpenAI vision pass
      // on this image and persist the description + tags to
      // media_metadata. The Social Studio generator uses both to pick
      // photos that fit today's topic and to write captions about
      // what's actually in the frame. Failure is swallowed inside
      // tagUploadedImage; the upload itself is unaffected.
      void scheduleMediaVisionTagAction({
        propertyId,
        key: result.key,
        contentType,
      }).catch((err) => {
        console.warn('[upload] vision tag schedule failed', err)
      })
    }
    return result.ok
  }

  async function uploadSingle(
    file: File,
    contentType: string,
    jobId: string,
    onProgress: (pct: number) => void,
  ): Promise<{ ok: true; key: string } | { ok: false }> {
    const presign = await presignUploadAction({
      propertyId,
      filename: file.name,
      contentType,
      size: file.size,
    })
    if (!presign.ok) {
      failJob(jobId, presign.error)
      return { ok: false }
    }
    try {
      await xhrPut(presign.url, file, contentType, onProgress)
      finishJob(jobId)
      return { ok: true, key: presign.key }
    } catch (err) {
      failJob(jobId, err instanceof Error ? err.message : 'Upload failed')
      return { ok: false }
    }
  }

  async function uploadMultipart(
    file: File,
    contentType: string,
    jobId: string,
    onProgress: (pct: number) => void,
  ): Promise<{ ok: true; key: string } | { ok: false }> {
    const init = await initMultipartUploadAction({
      propertyId,
      filename: file.name,
      contentType,
      size: file.size,
    })
    if (!init.ok) {
      failJob(jobId, init.error)
      return { ok: false }
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
        return { ok: false }
      }

      onProgress(100)
      finishJob(jobId)
      return { ok: true, key: init.key }
    } catch (err) {
      failJob(jobId, err instanceof Error ? err.message : 'Upload failed')
      await abortMultipartUploadAction({
        propertyId,
        key: init.key,
        uploadId: init.uploadId,
      })
      return { ok: false }
    }
  }

  /**
   * Capture a default cover frame from the just-uploaded File (still in
   * memory client-side) and attach it as the video's poster. Returns true
   * on success, false if the browser couldn't decode the file (the caller
   * queues a retry from the R2 URL once the batch settles).
   */
  async function attachDefaultPoster(file: File, videoKey: string): Promise<boolean> {
    const blob = await captureFrameBlobFromFile(file, DEFAULT_POSTER_TIME_S)
    if (!blob) return false
    const presign = await presignPosterUploadAction({
      propertyId,
      videoKey,
      size: blob.size,
    })
    if (!presign.ok) throw new Error(presign.error)
    await xhrPut(presign.url, blob, 'image/jpeg', () => {})
    const result = await setVideoPosterAction({
      propertyId,
      videoKey,
      posterKey: presign.posterKey,
    })
    if (!result.ok) throw new Error(result.error)
    router.refresh()
    return true
  }

  /**
   * Second-chance pass for any video whose in-memory auto-poster didn't
   * land. Decodes from the R2 public URL with `crossOrigin="anonymous"` so
   * canvas reads aren't tainted. Only one retry — if R2 also can't decode,
   * the file is genuinely unsupported (typically iPhone HEVC .mov on
   * Chrome) and the user has to pick a cover manually.
   */
  async function retryMissingPosters(videoKeys: string[]): Promise<void> {
    for (const videoKey of videoKeys) {
      try {
        const blob = await captureFrameBlobFromUrl(
          publicUrlForKey(videoKey),
          DEFAULT_POSTER_TIME_S,
        )
        if (!blob) {
          console.warn('[upload] retry poster: still undecodable', videoKey)
          continue
        }
        const presign = await presignPosterUploadAction({
          propertyId,
          videoKey,
          size: blob.size,
        })
        if (!presign.ok) throw new Error(presign.error)
        await xhrPut(presign.url, blob, 'image/jpeg', () => {})
        const result = await setVideoPosterAction({
          propertyId,
          videoKey,
          posterKey: presign.posterKey,
        })
        if (!result.ok) throw new Error(result.error)
        router.refresh()
      } catch (err) {
        console.warn('[upload] retry poster failed', videoKey, err)
      }
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
                Images and videos up to 5 GB. Each video gets an auto-cover
                you can change later from its preview. Uploads to{' '}
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

/**
 * Build the public CDN URL for an R2 key without pulling in the
 * server-only r2/client module. NEXT_PUBLIC_R2_PUBLIC_URL is the same env
 * var the server-side helper reads, so the two stay in sync.
 */
function publicUrlForKey(key: string): string {
  const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '').replace(/\/+$/, '')
  const encoded = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${base}/${encoded}`
}

/**
 * Off-DOM frame extraction. Loads the File via an object URL into a hidden
 * <video>, seeks to `time`, draws to a canvas, and returns a JPEG Blob.
 * Returns null if the browser can't decode the codec (typical for iPhone
 * HEVC .mov on Chrome/Firefox) — caller treats that as "no auto-poster,
 * user picks one later".
 */
async function captureFrameBlobFromFile(
  file: File,
  time: number,
): Promise<Blob | null> {
  if (typeof window === 'undefined') return null
  const url = URL.createObjectURL(file)
  try {
    return await captureFrameBlobFromVideoSrc(url, time, false)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Same as captureFrameBlobFromFile but for a public R2 URL. Used by the
 * post-batch retry: if the in-memory capture missed (transient PUT error,
 * tab throttled mid-decode), R2 has the file by now and a fresh decode
 * usually succeeds. CORS is set up on the bucket to allow GET, so
 * crossOrigin="anonymous" keeps the canvas untainted.
 */
async function captureFrameBlobFromUrl(
  url: string,
  time: number,
): Promise<Blob | null> {
  if (typeof window === 'undefined' || !url) return null
  return captureFrameBlobFromVideoSrc(url, time, true)
}

async function captureFrameBlobFromVideoSrc(
  src: string,
  time: number,
  crossOrigin: boolean,
): Promise<Blob | null> {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'
  if (crossOrigin) video.crossOrigin = 'anonymous'
  video.src = src

  try {
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('metadata load failed'))
      }
      function cleanup() {
        video.removeEventListener('loadedmetadata', onLoaded)
        video.removeEventListener('error', onError)
      }
      video.addEventListener('loadedmetadata', onLoaded)
      video.addEventListener('error', onError)
    })
    if (video.videoWidth === 0 || video.videoHeight === 0) return null

    // Clamp the seek target so very short clips still produce a frame.
    const target = Math.min(time, Math.max(0, (video.duration || 0) - 0.05))
    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('seek failed'))
      }
      function cleanup() {
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('error', onError)
      }
      video.addEventListener('seeked', onSeeked)
      video.addEventListener('error', onError)
      video.currentTime = target
    })

    const maxWidth = 1280
    const ratio =
      video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1
    const w = Math.round(video.videoWidth * ratio)
    const h = Math.round(video.videoHeight * ratio)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, w, h)

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85)
    })
  } catch {
    return null
  }
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
