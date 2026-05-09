'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ItDocumentCategory, Property } from '@/lib/supabase/types'
import {
  presignDocumentUploadAction,
  saveDocumentAction,
} from '../actions'
import {
  DOCUMENT_CATEGORY_LABELS,
  asOptions,
} from '../../_lib/labels'

type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading'; pct: number }
  | { kind: 'saving' }
  | { kind: 'error'; message: string }

export function UploadDocumentForm({
  properties,
}: {
  properties: Property[]
}) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<ItDocumentCategory>('contract')
  const [propertyId, setPropertyId] = useState<string>('')
  const [expiresAt, setExpiresAt] = useState('')
  const [notes, setNotes] = useState('')
  const [state, setState] = useState<UploadState>({ kind: 'idle' })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const options = asOptions(DOCUMENT_CATEGORY_LABELS)
  const busy = state.kind === 'uploading' || state.kind === 'saving'

  function reset() {
    setFile(null)
    setTitle('')
    setCategory('contract')
    setPropertyId('')
    setExpiresAt('')
    setNotes('')
    setState({ kind: 'idle' })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function pickFile(f: File | null) {
    setFile(f)
    if (f && !title) {
      // Best-effort: prefill the title with the filename minus extension.
      const dot = f.name.lastIndexOf('.')
      setTitle(dot === -1 ? f.name : f.name.slice(0, dot))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      setState({ kind: 'error', message: 'Choose a file to upload.' })
      return
    }
    if (!title.trim()) {
      setState({ kind: 'error', message: 'Give the document a title.' })
      return
    }

    setState({ kind: 'uploading', pct: 0 })

    const presign = await presignDocumentUploadAction({
      propertyId: propertyId || null,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
    })
    if (!presign.ok) {
      setState({ kind: 'error', message: presign.error })
      return
    }

    try {
      await putWithProgress(presign.url, file, (pct) =>
        setState({ kind: 'uploading', pct }),
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.'
      setState({ kind: 'error', message })
      return
    }

    setState({ kind: 'saving' })
    const save = await saveDocumentAction({
      propertyId: propertyId || null,
      key: presign.key,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      title: title.trim(),
      category,
      expiresAt: expiresAt || null,
      notes: notes.trim() || null,
    })
    if (!save.ok) {
      setState({ kind: 'error', message: save.error })
      return
    }

    reset()
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="File" htmlFor="doc-file" hint="PDF, Word, Excel, PowerPoint, or image. Up to 100 MB.">
        <input
          id="doc-file"
          ref={fileInputRef}
          type="file"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-fg file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-fg hover:file:bg-surface"
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="doc-title">
          <Input
            id="doc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Comcast Business agreement"
            required
          />
        </Field>
        <Field label="Category" htmlFor="doc-category">
          <select
            id="doc-category"
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as ItDocumentCategory)
            }
            className="h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs focus-ring"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
          >
            <option value="">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Expires"
          htmlFor="doc-expires"
          hint="Optional. We'll remind you when it's getting close."
        >
          <Input
            id="doc-expires"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="doc-notes">
        <textarea
          id="doc-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg shadow-xs focus-ring"
          placeholder="What it covers, who signed it, where the original lives..."
        />
      </Field>

      {state.kind === 'uploading' ? (
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{ width: `${Math.round(state.pct)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            Uploading… {Math.round(state.pct)}%
          </p>
        </div>
      ) : null}
      {state.kind === 'saving' ? (
        <p className="text-xs text-muted">Saving details…</p>
      ) : null}
      {state.kind === 'error' ? (
        <p className="text-sm text-danger-fg">{state.message}</p>
      ) : null}

      <Button type="submit" disabled={busy}>
        {busy ? 'Uploading...' : 'Upload document'}
      </Button>
    </form>
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

function putWithProgress(
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
