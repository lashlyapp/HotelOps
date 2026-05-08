'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState, useTransition } from 'react'
// Note: useEffect is used inside PreviewDialog for keydown / scroll lock.
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'
import type { MediaFile } from '@/lib/r2/list'
import { formatBytes } from '@/lib/r2/stats'
import {
  deleteMediaAction,
  updateMediaMetadataAction,
} from '@/lib/media/actions'
import { DropZone } from './drop-zone'
import { TagEditor } from './tag-editor'

type Type = 'all' | 'image' | 'video' | 'document'

export function MediaBrowser({
  files: initialFiles,
  propertyId,
  propertyName,
  propertySlug,
}: {
  files: MediaFile[]
  propertyId: string
  propertyName: string
  propertySlug: string
}) {
  // Local state for optimistic tag/delete updates; resets when the server
  // re-renders us with a new file list (post-upload, post-delete revalidation).
  const [files, setFiles] = useState(initialFiles)
  const [seenInitial, setSeenInitial] = useState(initialFiles)
  if (initialFiles !== seenInitial) {
    setSeenInitial(initialFiles)
    setFiles(initialFiles)
  }

  const [query, setQuery] = useState('')
  const [type, setType] = useState<Type>('all')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [active, setActive] = useState<MediaFile | null>(null)

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const f of files) for (const t of f.tags) set.add(t)
    return Array.from(set).sort()
  }, [files])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return files.filter((file) => {
      if (type !== 'all') {
        const ct = file.contentType ?? ''
        if (type === 'image' && !ct.startsWith('image/')) return false
        if (type === 'video' && !ct.startsWith('video/')) return false
        if (type === 'document' && ct !== 'application/pdf') return false
      }
      if (tagFilter && !file.tags.includes(tagFilter)) return false
      if (!q) return true
      return (
        file.filename.toLowerCase().includes(q) ||
        file.displayName.toLowerCase().includes(q) ||
        (file.description?.toLowerCase().includes(q) ?? false) ||
        file.tags.some((t) => t.includes(q))
      )
    })
  }, [files, query, type, tagFilter])

  function handleTagChange(key: string, nextTags: string[]) {
    setFiles((prev) =>
      prev.map((f) => (f.key === key ? { ...f, tags: nextTags } : f)),
    )
  }

  function handleMetadataChange(
    key: string,
    next: { displayName: string; description: string | null },
  ) {
    setFiles((prev) =>
      prev.map((f) =>
        f.key === key
          ? { ...f, displayName: next.displayName, description: next.description }
          : f,
      ),
    )
    setActive((curr) =>
      curr && curr.key === key
        ? { ...curr, displayName: next.displayName, description: next.description }
        : curr,
    )
  }

  return (
    <div className="space-y-5">
      <DropZone
        propertyId={propertyId}
        propertySlug={propertySlug}
        propertyName={propertyName}
      />

      {files.length === 0 ? (
        <p className="text-sm text-muted py-8 text-center">
          No media yet for {propertyName}. Upload your first file above.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 max-w-md">
              <Input
                type="search"
                placeholder="Search filename, description, or tag..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <FilterTabs value={type} onChange={setType} />
          </div>

          {allTags.length > 0 ? (
            <TagFilterBar
              tags={allTags}
              active={tagFilter}
              onChange={setTagFilter}
            />
          ) : null}

          {filtered.length === 0 ? (
            <p className="text-sm text-muted py-12 text-center">
              No files match your filters.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((file) => (
                <MediaCard
                  key={file.key}
                  file={file}
                  propertyId={propertyId}
                  onPreview={() => setActive(file)}
                  onTagsChange={(t) => handleTagChange(file.key, t)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {active ? (
        <PreviewDialog
          file={active}
          propertyId={propertyId}
          onClose={() => setActive(null)}
          onDeleted={(key) => {
            setFiles((prev) => prev.filter((f) => f.key !== key))
            setActive(null)
          }}
          onMetadataChange={handleMetadataChange}
        />
      ) : null}
    </div>
  )
}

function FilterTabs({
  value,
  onChange,
}: {
  value: Type
  onChange: (next: Type) => void
}) {
  const options: Array<{ value: Type; label: string }> = [
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

function TagFilterBar({
  tags,
  active,
  onChange,
}: {
  tags: string[]
  active: string | null
  onChange: (next: string | null) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-subtle">Tags</span>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          'focus-ring rounded-full px-2.5 py-0.5 text-xs',
          active === null
            ? 'bg-fg text-bg'
            : 'bg-surface-muted text-muted hover:text-fg',
        )}
      >
        All
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onChange(active === tag ? null : tag)}
          className={cn(
            'focus-ring rounded-full px-2.5 py-0.5 text-xs',
            active === tag
              ? 'bg-fg text-bg'
              : 'bg-surface-muted text-muted hover:text-fg',
          )}
        >
          {tag}
        </button>
      ))}
    </div>
  )
}

function MediaCard({
  file,
  propertyId,
  onPreview,
  onTagsChange,
}: {
  file: MediaFile
  propertyId: string
  onPreview: () => void
  onTagsChange: (tags: string[]) => void
}) {
  const isImage = file.contentType?.startsWith('image/') ?? false

  return (
    <Card className="flex flex-col overflow-hidden">
      <button
        type="button"
        onClick={onPreview}
        className="focus-ring relative aspect-[4/3] w-full bg-surface-muted"
        aria-label={`Preview ${file.displayName}`}
      >
        {isImage ? (
          <Image
            src={file.url}
            alt={file.displayName}
            fill
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
          <p className="text-sm font-medium text-fg">{file.displayName}</p>
          <p className="mt-0.5 text-xs text-subtle font-mono truncate">
            {file.filename} · {formatBytes(file.size)}
          </p>
          {file.description ? (
            <p className="mt-1 text-xs text-muted line-clamp-2">
              {file.description}
            </p>
          ) : null}
        </div>

        <TagEditor
          propertyId={propertyId}
          fileKey={file.key}
          initialTags={file.tags}
          onChange={onTagsChange}
        />

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
      // Clipboard unavailable; URL stays selectable.
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-muted p-1.5">
      <code title={url} className="flex-1 truncate px-1 text-xs text-muted font-mono">
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
  propertyId,
  onClose,
  onDeleted,
  onMetadataChange,
}: {
  file: MediaFile
  propertyId: string
  onClose: () => void
  onDeleted: (key: string) => void
  onMetadataChange: (
    key: string,
    next: { displayName: string; description: string | null },
  ) => void
}) {
  const [, startTransition] = useTransition()
  const [deleting, setDeleting] = useState(false)
  const [displayName, setDisplayName] = useState(file.displayName)
  const [description, setDescription] = useState(file.description ?? '')
  const [savingMeta, setSavingMeta] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)

  const dirty =
    displayName.trim() !== file.displayName.trim() ||
    description.trim() !== (file.description ?? '').trim()

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

  function handleDelete() {
    if (!confirm(`Delete ${file.filename}? This removes it from R2 permanently.`)) return
    setDeleting(true)
    startTransition(async () => {
      await deleteMediaAction({ propertyId, key: file.key })
      onDeleted(file.key)
    })
  }

  async function handleSaveMeta() {
    setSavingMeta(true)
    setMetaError(null)
    const result = await updateMediaMetadataAction({
      propertyId,
      key: file.key,
      displayName,
      description,
    })
    setSavingMeta(false)
    if (!result.ok) {
      setMetaError(result.error)
      return
    }
    onMetadataChange(file.key, {
      displayName: result.displayName?.trim() || file.displayName,
      description: result.description,
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${file.displayName}`}
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
              alt={file.displayName}
              width={1600}
              height={1200}
              unoptimized
              className="max-h-[70vh] w-auto object-contain"
            />
          ) : isVideo ? (
            <video src={file.url} controls className="max-h-[70vh] w-full" />
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

        <div className="border-t border-border-subtle p-4 space-y-3 overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <label className="block">
                <span className="text-xs uppercase tracking-wider text-subtle">
                  Name
                </span>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={120}
                  placeholder={file.displayName}
                  className="mt-1 text-base font-semibold"
                />
              </label>
              <p className="text-xs text-subtle font-mono truncate" title={file.filename}>
                {file.filename} · {formatBytes(file.size)}
              </p>
              {file.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {file.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs text-fg"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-subtle">
              Description
              <span className="ml-1 normal-case tracking-normal text-muted">
                (optional)
              </span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Add notes about this file…"
              className="focus-ring mt-1 w-full resize-y rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg placeholder:text-subtle"
            />
          </label>

          {metaError ? (
            <p className="text-xs text-danger-fg">{metaError}</p>
          ) : null}

          <CopyableUrl url={file.url} />

          <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="focus-ring rounded-md px-3 py-1.5 text-xs font-medium text-danger-fg hover:bg-danger-bg/40 disabled:opacity-50 transition-colors"
            >
              {deleting ? 'Deleting...' : 'Delete file'}
            </button>
            <Button
              size="sm"
              onClick={handleSaveMeta}
              disabled={!dirty || savingMeta}
            >
              {savingMeta ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
