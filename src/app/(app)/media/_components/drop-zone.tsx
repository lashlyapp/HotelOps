'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import {
  presignUploadAction,
  revalidateAfterUploadAction,
} from '@/lib/media/actions'

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

    // Concurrent uploads with a worker-pool pattern. Cap at 4 to avoid
    // saturating the user's uplink and the browser's connection pool.
    const CONCURRENCY = 4
    const results = await runWithLimit(incoming, CONCURRENCY, (file, i) =>
      uploadOne(file, newJobs[i].id, (pct) =>
        updateJob(newJobs[i].id, pct),
      ),
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

  async function uploadOne(
    file: File,
    jobId: string,
    onProgress: (pct: number) => void,
  ): Promise<boolean> {
    try {
      const presign = await presignUploadAction({
        propertyId,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      })
      if (!presign.ok) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? { ...j, status: 'error', error: presign.error }
              : j,
          ),
        )
        return false
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', presign.url)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const pct = Math.round((evt.loaded / evt.total) * 100)
            onProgress(pct)
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`Upload failed (${xhr.status})`))
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(file)
      })

      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: 'done' } : j)),
      )
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId ? { ...j, status: 'error', error: message } : j,
        ),
      )
      return false
    }
  }

  function clearDone() {
    setJobs((prev) => prev.filter((j) => j.status !== 'done'))
  }

  return (
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
      <div className="p-6 text-center space-y-3">
        <p className="text-sm text-fg">
          Drag & drop files here, or
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={pickFiles}>
          Choose files
        </Button>
        <p className="text-xs text-subtle">
          Images, videos, and PDFs up to 200 MB each. Uploads to{' '}
          <span className="text-fg">{propertyName}</span>.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*,application/pdf"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {jobs.length > 0 ? (
        <div className="border-t border-border-subtle p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
              Uploads
            </p>
            <button
              type="button"
              onClick={clearDone}
              className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
            >
              Clear completed
            </button>
          </div>
          <ul className="space-y-2">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function JobRow({ job }: { job: Job }) {
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
    </li>
  )
}

/**
 * Run async tasks against a list with bounded concurrency. Each worker pulls
 * the next index off a shared counter, so faster tasks don't sit idle waiting
 * for slower ones in the same batch.
 */
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
