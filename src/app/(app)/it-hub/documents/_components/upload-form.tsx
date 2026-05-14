'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils/cn'
import type {
  ItDocumentCategory,
  ItDocumentFolder,
  Property,
} from '@/lib/supabase/types'
import {
  presignDocumentUploadAction,
  saveDocumentAction,
} from '../actions'
import {
  DOCUMENT_CATEGORY_LABELS,
  asOptions,
} from '../../_lib/labels'
import { flattenFolderOptions } from '../_lib/folder-options'

const FILES_IN_FLIGHT = 3

type ItemStatus =
  | { kind: 'pending' }
  | { kind: 'uploading'; pct: number }
  | { kind: 'saving' }
  | { kind: 'done' }
  | { kind: 'error'; message: string }

type Item = {
  id: string
  file: File
  title: string
  status: ItemStatus
}

export function UploadDocumentForm({
  properties,
  folders,
  currentFolderId,
}: {
  properties: Property[]
  folders: ItDocumentFolder[]
  currentFolderId: string | null
}) {
  const [items, setItems] = useState<Item[]>([])
  const [category, setCategory] = useState<ItDocumentCategory>('contract')
  const [propertyId, setPropertyId] = useState<string>('')
  const [folderId, setFolderId] = useState<string>(currentFolderId ?? '')
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const categoryOptions = asOptions(DOCUMENT_CATEGORY_LABELS)
  const folderOptions = flattenFolderOptions(folders)

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files)
    if (incoming.length === 0) return
    setError(null)
    const next: Item[] = incoming.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      file: f,
      title: defaultTitle(f.name),
      status: { kind: 'pending' },
    }))
    setItems((prev) => [...prev, ...next])
  }

  function pickFiles() {
    inputRef.current?.click()
  }

  function updateItem(id: string, patch: Partial<Item>) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    )
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  function clearFinished() {
    setItems((prev) =>
      prev.filter(
        (it) => it.status.kind !== 'done' && it.status.kind !== 'error',
      ),
    )
  }

  async function uploadOne(item: Item): Promise<boolean> {
    const title = item.title.trim()
    if (!title) {
      updateItem(item.id, {
        status: { kind: 'error', message: 'Title is required.' },
      })
      return false
    }

    updateItem(item.id, { status: { kind: 'uploading', pct: 0 } })
    const contentType = item.file.type || 'application/octet-stream'
    const presign = await presignDocumentUploadAction({
      propertyId: propertyId || null,
      filename: item.file.name,
      contentType,
      size: item.file.size,
    })
    if (!presign.ok) {
      updateItem(item.id, { status: { kind: 'error', message: presign.error } })
      return false
    }

    try {
      await putWithProgress(presign.url, item.file, contentType, (pct) =>
        updateItem(item.id, { status: { kind: 'uploading', pct } }),
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.'
      updateItem(item.id, { status: { kind: 'error', message } })
      return false
    }

    updateItem(item.id, { status: { kind: 'saving' } })
    const save = await saveDocumentAction({
      propertyId: propertyId || null,
      folderId: folderId || null,
      key: presign.key,
      fileName: item.file.name,
      contentType,
      size: item.file.size,
      title,
      category,
      expiresAt: null,
      notes: null,
    })
    if (!save.ok) {
      updateItem(item.id, { status: { kind: 'error', message: save.error } })
      return false
    }
    updateItem(item.id, { status: { kind: 'done' } })
    return true
  }

  async function handleUploadAll() {
    const queue = items.filter(
      (it) => it.status.kind === 'pending' || it.status.kind === 'error',
    )
    if (queue.length === 0) {
      setError('Add at least one file to upload.')
      return
    }
    setError(null)
    setBusy(true)
    // Titles are disabled once busy=true, so the snapshot at click time
    // matches whatever the user sees during the upload.
    const anySaved = await runWithLimit(queue, FILES_IN_FLIGHT, (item) =>
      uploadOne(item),
    )
    setBusy(false)
    if (anySaved.some(Boolean)) {
      startTransition(() => router.refresh())
    }
  }

  const pendingCount = items.filter(
    (it) => it.status.kind === 'pending' || it.status.kind === 'error',
  ).length
  const hasFinished = items.some(
    (it) => it.status.kind === 'done' || it.status.kind === 'error',
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Folder"
          htmlFor="doc-folder"
          hint="Where the files land. Defaults to the folder you're in."
        >
          <select
            id="doc-folder"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
            disabled={busy}
          >
            <option value="">Documents (root)</option>
            {folderOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Category"
          htmlFor="doc-category"
          hint="Applied to every file in this batch."
        >
          <select
            id="doc-category"
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as ItDocumentCategory)
            }
            className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
            disabled={busy}
          >
            {categoryOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Property"
          htmlFor="doc-property"
          hint="Leave blank if it covers the whole organization."
        >
          <select
            id="doc-property"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
            disabled={busy}
          >
            <option value="">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
        }}
        className={cn(
          'rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          over
            ? 'border-fg bg-surface-muted'
            : 'border-border-default bg-surface',
        )}
      >
        <p className="text-sm text-fg">Drag &amp; drop files here, or</p>
        <div className="mt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={pickFiles}
            disabled={busy}
          >
            Choose files
          </Button>
        </div>
        <p className="mt-2 text-xs text-subtle">
          PDF, Word, Excel, PowerPoint, or image. Up to 100 MB each. Add notes
          and expiry per document after upload.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip,application/rtf,text/plain,text/csv,text/markdown,image/jpeg,image/png,image/webp,image/svg+xml"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {items.length > 0 ? (
        <div className="rounded-lg border border-border-subtle bg-surface">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
              {items.length} {items.length === 1 ? 'file' : 'files'}
            </p>
            {hasFinished ? (
              <button
                type="button"
                onClick={clearFinished}
                disabled={busy}
                className="focus-ring rounded-sm text-xs text-muted hover:text-fg disabled:opacity-50"
              >
                Clear finished
              </button>
            ) : null}
          </div>
          <ul className="divide-y divide-border-subtle">
            {items.map((it) => (
              <li key={it.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Input
                      value={it.title}
                      onChange={(e) =>
                        updateItem(it.id, { title: e.target.value })
                      }
                      placeholder="Document title"
                      disabled={
                        busy ||
                        it.status.kind === 'uploading' ||
                        it.status.kind === 'saving' ||
                        it.status.kind === 'done'
                      }
                    />
                    <p className="truncate text-xs text-subtle" title={it.file.name}>
                      {it.file.name} · {formatBytes(it.file.size)}
                    </p>
                    {it.status.kind === 'uploading' ? (
                      <ProgressBar pct={it.status.pct} label="Uploading" />
                    ) : it.status.kind === 'saving' ? (
                      <p className="text-xs text-muted">Saving details…</p>
                    ) : it.status.kind === 'done' ? (
                      <p className="text-xs text-success-fg">Uploaded.</p>
                    ) : it.status.kind === 'error' ? (
                      <p className="text-xs text-danger-fg">
                        {it.status.message}
                      </p>
                    ) : null}
                  </div>
                  {it.status.kind === 'uploading' ||
                  it.status.kind === 'saving' ? null : (
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      disabled={busy}
                      aria-label={`Remove ${it.file.name}`}
                      className="focus-ring rounded-sm px-2 text-sm text-muted hover:text-fg disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="text-sm text-danger-fg">{error}</p> : null}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={handleUploadAll}
          disabled={busy || pendingCount === 0}
        >
          {busy
            ? 'Uploading…'
            : pendingCount > 1
              ? `Upload ${pendingCount} files`
              : 'Upload document'}
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  )
}

function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full bg-fg transition-[width] duration-200"
          style={{ width: `${Math.round(pct)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted">
        {label}… {Math.round(pct)}%
      </p>
    </div>
  )
}

function defaultTitle(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? filename : filename.slice(0, dot)
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed (${xhr.status}).`))
    }
    xhr.onerror = () => reject(new Error('Upload failed.'))
    xhr.send(file)
  })
}

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
