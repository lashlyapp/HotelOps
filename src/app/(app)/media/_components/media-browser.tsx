'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'
import type { MediaFile } from '@/lib/r2/list'
import { formatBytes } from '@/lib/r2/stats'

export function MediaBrowser({ files }: { files: MediaFile[] }) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'all' | 'image' | 'video' | 'document'>(
    'all',
  )
  const [active, setActive] = useState<MediaFile | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return files.filter((file) => {
      if (type !== 'all') {
        const ct = file.contentType ?? ''
        if (type === 'image' && !ct.startsWith('image/')) return false
        if (type === 'video' && !ct.startsWith('video/')) return false
        if (type === 'document' && ct !== 'application/pdf') return false
      }
      if (!q) return true
      return (
        file.filename.toLowerCase().includes(q) ||
        file.description.toLowerCase().includes(q)
      )
    })
  }, [files, query, type])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 max-w-md">
          <Input
            type="search"
            placeholder="Search by filename or description..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <FilterTabs value={type} onChange={setType} />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted py-12 text-center">
          No files match your search.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((file) => (
            <MediaCard
              key={file.key}
              file={file}
              onPreview={() => setActive(file)}
            />
          ))}
        </ul>
      )}

      {active ? (
        <PreviewDialog file={active} onClose={() => setActive(null)} />
      ) : null}
    </div>
  )
}

function FilterTabs({
  value,
  onChange,
}: {
  value: 'all' | 'image' | 'video' | 'document'
  onChange: (next: 'all' | 'image' | 'video' | 'document') => void
}) {
  const options: Array<{ value: typeof value; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'image', label: 'Images' },
    { value: 'video', label: 'Videos' },
    { value: 'document', label: 'Documents' },
  ]
  return (
    <div className="inline-flex rounded-md border border-border-default bg-surface p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'focus-ring rounded-sm px-3 py-1 text-xs font-medium transition-colors',
            value === opt.value
              ? 'bg-surface-muted text-fg'
              : 'text-muted hover:text-fg',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function MediaCard({
  file,
  onPreview,
}: {
  file: MediaFile
  onPreview: () => void
}) {
  const isImage = file.contentType?.startsWith('image/') ?? false

  return (
    <Card className="flex flex-col overflow-hidden">
      <button
        type="button"
        onClick={onPreview}
        className="focus-ring relative aspect-[4/3] w-full bg-surface-muted"
        aria-label={`Preview ${file.description}`}
      >
        {isImage ? (
          <Image
            src={file.url}
            alt={file.description}
            fill
            unoptimized
            sizes="(min-width:1280px) 25vw, (min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-wider text-subtle">
            {file.contentType ?? 'file'}
          </div>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-sm font-medium text-fg">{file.description}</p>
          <p className="mt-0.5 text-xs text-subtle font-mono truncate">
            {file.filename} · {formatBytes(file.size)}
          </p>
        </div>

        <CopyableUrl url={file.url} />
      </div>
    </Card>
  )
}

function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can fail; URL stays selectable as fallback.
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-muted p-1.5">
      <code
        title={url}
        className="flex-1 truncate px-1 text-xs text-muted font-mono"
      >
        {url}
      </code>
      <Button size="sm" onClick={copy} aria-live="polite">
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

function PreviewDialog({
  file,
  onClose,
}: {
  file: MediaFile
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const isImage = file.contentType?.startsWith('image/') ?? false
  const isVideo = file.contentType?.startsWith('video/') ?? false

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${file.description}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface text-fg max-w-4xl w-full max-h-[90vh] overflow-hidden rounded-lg shadow-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 min-h-0 bg-surface-muted flex items-center justify-center">
          {isImage ? (
            <Image
              src={file.url}
              alt={file.description}
              width={1600}
              height={1200}
              unoptimized
              className="max-h-[70vh] w-auto object-contain"
            />
          ) : isVideo ? (
            <video
              src={file.url}
              controls
              className="max-h-[70vh] w-full"
            />
          ) : (
            <div className="p-12 text-sm text-muted">
              No inline preview for {file.contentType ?? 'this file type'}.
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 underline"
              >
                Open in new tab
              </a>
            </div>
          )}
        </div>

        <div className="border-t border-border-subtle p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-fg">
                {file.description}
              </p>
              <p className="mt-0.5 text-xs text-subtle font-mono truncate">
                {file.filename} · {formatBytes(file.size)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
          <CopyableUrl url={file.url} />
        </div>
      </div>
    </div>
  )
}
