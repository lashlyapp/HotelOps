'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
// Note: useEffect is used inside PreviewDialog for keydown / scroll lock.
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'
import type { MediaFile } from '@/lib/r2/list'
import { formatBytes, formatRelative } from '@/lib/r2/stats'
import {
  bulkDeleteMediaAction,
  deleteMediaAction,
  presignDownloadAction,
  updateMediaMetadataAction,
} from '@/lib/media/actions'
import { DropZone } from './drop-zone'
import { TagEditor } from './tag-editor'

type Type = 'all' | 'image' | 'video'
type View = 'grid' | 'list'

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
  const [view, setView] = useState<View>('grid')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState<null | 'delete' | 'download'>(null)

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

  // Prune selection when files change (e.g. after a delete) so we don't keep
  // dangling keys around. Render-phase sync — the file list is the source of
  // truth, selection just mirrors a subset of it.
  const [seenFilesForSelection, setSeenFilesForSelection] = useState(files)
  if (files !== seenFilesForSelection) {
    setSeenFilesForSelection(files)
    if (selected.size > 0) {
      const live = new Set(files.map((f) => f.key))
      let changed = false
      const next = new Set<string>()
      for (const k of selected) {
        if (live.has(k)) next.add(k)
        else changed = true
      }
      if (changed) setSelected(next)
    }
  }

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function selectAllVisible() {
    setSelected(new Set(filtered.map((f) => f.key)))
  }
  function clearSelection() {
    setSelected(new Set())
  }

  async function handleBulkDelete() {
    const keys = Array.from(selected)
    if (keys.length === 0) return
    if (
      !confirm(
        `Delete ${keys.length} file${keys.length === 1 ? '' : 's'}? This removes ${keys.length === 1 ? 'it' : 'them'} from R2 permanently.`,
      )
    )
      return
    setBulkBusy('delete')
    const result = await bulkDeleteMediaAction({ propertyId, keys })
    setBulkBusy(null)
    if (!result.ok) {
      alert(result.error)
      return
    }
    const removed = new Set(keys)
    setFiles((prev) => prev.filter((f) => !removed.has(f.key)))
    setSelected(new Set())
  }

  async function handleBulkDownload() {
    const keys = Array.from(selected)
    if (keys.length === 0) return
    setBulkBusy('download')
    const byKey = new Map(files.map((f) => [f.key, f]))
    for (const key of keys) {
      const file = byKey.get(key)
      if (!file) continue
      const result = await presignDownloadAction({
        propertyId,
        key: file.key,
        filename: file.filename,
      })
      if (!result.ok) continue
      const a = document.createElement('a')
      a.href = result.url
      a.download = file.filename
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // Stagger so Chrome doesn't lump everything into one "Allow multiple
      // downloads?" prompt; also keeps the network panel readable.
      await new Promise((r) => setTimeout(r, 250))
    }
    setBulkBusy(null)
  }

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
            <div className="flex items-center gap-2">
              <FilterTabs value={type} onChange={setType} />
              <ViewToggle value={view} onChange={setView} />
            </div>
          </div>

          {allTags.length > 0 ? (
            <TagFilterBar
              tags={allTags}
              active={tagFilter}
              onChange={setTagFilter}
            />
          ) : null}

          {selected.size > 0 ? (
            <BulkActionBar
              selectedCount={selected.size}
              busy={bulkBusy}
              onClear={clearSelection}
              onDelete={handleBulkDelete}
              onDownload={handleBulkDownload}
            />
          ) : null}

          {filtered.length === 0 ? (
            <p className="text-sm text-muted py-12 text-center">
              No files match your filters.
            </p>
          ) : view === 'grid' ? (
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((file) => (
                <MediaCard
                  key={file.key}
                  file={file}
                  propertyId={propertyId}
                  selected={selected.has(file.key)}
                  onToggleSelect={() => toggleSelect(file.key)}
                  onPreview={() => setActive(file)}
                  onTagsChange={(t) => handleTagChange(file.key, t)}
                />
              ))}
            </ul>
          ) : (
            <MediaList
              files={filtered}
              propertyId={propertyId}
              selected={selected}
              onToggleSelect={toggleSelect}
              onSelectAll={selectAllVisible}
              onClearSelection={clearSelection}
              onPreview={(file) => setActive(file)}
            />
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

function ViewToggle({
  value,
  onChange,
}: {
  value: View
  onChange: (next: View) => void
}) {
  return (
    <div
      role="group"
      aria-label="View mode"
      className="inline-flex rounded-md border border-border-default bg-surface p-0.5"
    >
      {(['grid', 'list'] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          aria-pressed={value === opt}
          aria-label={opt === 'grid' ? 'Grid view' : 'List view'}
          className={cn(
            'focus-ring rounded-sm px-2 py-1 text-xs font-medium transition-colors',
            value === opt
              ? 'bg-surface-muted text-fg'
              : 'text-muted hover:text-fg',
          )}
        >
          {opt === 'grid' ? <GridIcon /> : <ListIcon />}
        </button>
      ))}
    </div>
  )
}

function GridIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 fill-current">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 fill-current">
      <rect x="1" y="2" width="14" height="2" rx="1" />
      <rect x="1" y="7" width="14" height="2" rx="1" />
      <rect x="1" y="12" width="14" height="2" rx="1" />
    </svg>
  )
}

function SelectCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
  className,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  label: string
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked
  }, [indeterminate, checked])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'focus-ring size-4 cursor-pointer rounded-xs border border-border-default bg-surface accent-fg',
        className,
      )}
    />
  )
}

function BulkActionBar({
  selectedCount,
  busy,
  onClear,
  onDelete,
  onDownload,
}: {
  selectedCount: number
  busy: null | 'delete' | 'download'
  onClear: () => void
  onDelete: () => void
  onDownload: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border-default bg-surface-muted px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="text-sm text-fg">
          {selectedCount} selected
        </span>
        <button
          type="button"
          onClick={onClear}
          className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
        >
          Clear
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={onDownload}
          disabled={busy !== null}
        >
          {busy === 'download' ? 'Downloading…' : 'Download'}
        </Button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy !== null}
          className="focus-ring rounded-md bg-danger-bg/20 px-3 py-1.5 text-xs font-medium text-danger-fg hover:bg-danger-bg/40 disabled:opacity-50 transition-colors"
        >
          {busy === 'delete'
            ? 'Deleting…'
            : `Delete ${selectedCount} file${selectedCount === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}

function MediaList({
  files,
  propertyId,
  selected,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onPreview,
}: {
  files: MediaFile[]
  propertyId: string
  selected: Set<string>
  onToggleSelect: (key: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onPreview: (file: MediaFile) => void
}) {
  const allSelected =
    files.length > 0 && files.every((f) => selected.has(f.key))
  const someSelected = files.some((f) => selected.has(f.key))

  return (
    <div className="overflow-hidden rounded-md border border-border-subtle bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border-subtle bg-surface-muted/40 text-left text-xs uppercase tracking-wider text-subtle">
            <tr>
              <th scope="col" className="w-10 px-3 py-2">
                <SelectCheckbox
                  checked={allSelected}
                  indeterminate={!allSelected && someSelected}
                  onChange={() =>
                    allSelected ? onClearSelection() : onSelectAll()
                  }
                  label="Select all visible files"
                />
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Name
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Type
              </th>
              <th scope="col" className="px-3 py-2 font-medium text-right">
                Size
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Modified
              </th>
              <th scope="col" className="w-10 px-3 py-2" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <MediaListRow
                key={file.key}
                file={file}
                propertyId={propertyId}
                selected={selected.has(file.key)}
                onToggleSelect={() => onToggleSelect(file.key)}
                onPreview={() => onPreview(file)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MediaListRow({
  file,
  propertyId,
  selected,
  onToggleSelect,
  onPreview,
}: {
  file: MediaFile
  propertyId: string
  selected: boolean
  onToggleSelect: () => void
  onPreview: () => void
}) {
  const isImage = file.contentType?.startsWith('image/') ?? false
  const isVideo = file.contentType?.startsWith('video/') ?? false
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    const result = await presignDownloadAction({
      propertyId,
      key: file.key,
      filename: file.filename,
    })
    setDownloading(false)
    if (!result.ok) {
      alert(result.error)
      return
    }
    const a = document.createElement('a')
    a.href = result.url
    a.download = file.filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <tr
      className={cn(
        'border-b border-border-subtle last:border-b-0 hover:bg-surface-muted/30',
        selected && 'bg-surface-muted/50',
      )}
    >
      <td className="px-3 py-2 align-middle">
        <SelectCheckbox
          checked={selected}
          onChange={onToggleSelect}
          label={`Select ${file.displayName}`}
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <button
          type="button"
          onClick={onPreview}
          className="focus-ring flex items-center gap-3 text-left"
        >
          <span className="relative block h-10 w-14 shrink-0 overflow-hidden rounded-sm bg-surface-muted">
            {isImage ? (
              <Image
                src={file.url}
                alt=""
                fill
                sizes="56px"
                className="object-cover"
              />
            ) : isVideo ? (
              <VideoThumbnail file={file} />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-subtle">
                file
              </span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-fg">
              {file.displayName}
            </span>
            <span
              title={file.filename}
              className="block truncate text-xs text-subtle font-mono"
            >
              {file.filename}
            </span>
          </span>
        </button>
      </td>
      <td className="px-3 py-2 align-middle text-xs text-muted">
        {file.contentType ?? '—'}
      </td>
      <td className="px-3 py-2 align-middle text-right text-xs text-muted tabular-nums">
        {formatBytes(file.size)}
      </td>
      <td className="px-3 py-2 align-middle text-xs text-muted">
        {formatRelative(file.lastModified)}
      </td>
      <td className="px-3 py-2 align-middle text-right">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          aria-label={`Download ${file.displayName}`}
          className="focus-ring rounded-sm px-2 py-1 text-xs text-muted hover:text-fg disabled:opacity-50"
        >
          {downloading ? '…' : 'Download'}
        </button>
      </td>
    </tr>
  )
}

function MediaCard({
  file,
  propertyId,
  selected,
  onToggleSelect,
  onPreview,
  onTagsChange,
}: {
  file: MediaFile
  propertyId: string
  selected: boolean
  onToggleSelect: () => void
  onPreview: () => void
  onTagsChange: (tags: string[]) => void
}) {
  const isImage = file.contentType?.startsWith('image/') ?? false
  const isVideo = file.contentType?.startsWith('video/') ?? false

  return (
    <Card
      className={cn(
        'flex flex-col overflow-hidden transition-shadow',
        selected && 'ring-2 ring-fg',
      )}
    >
      <div className="relative">
        <SelectCheckbox
          checked={selected}
          onChange={onToggleSelect}
          label={`Select ${file.displayName}`}
          className="absolute left-2 top-2 z-10"
        />
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
        ) : isVideo ? (
          <VideoThumbnail file={file} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-wider text-subtle">
            {file.contentType ?? 'file'}
          </div>
        )}
        {isVideo ? <PlayBadge /> : null}
      </button>
      </div>

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

/**
 * Catalog thumbnail for video files. The user picks a frame at upload time
 * via the cover-picker; that JPEG lives next to the video in R2 and the
 * key is recorded in media_metadata.poster_key. Files that predate the
 * cover-picker (or where attaching the poster failed) render a static
 * placeholder so the catalog never has to fetch metadata ranges from a
 * multi-hundred-MB MP4.
 */
function VideoThumbnail({ file }: { file: MediaFile }) {
  if (file.posterUrl) {
    return (
      <Image
        src={file.posterUrl}
        alt={file.displayName}
        fill
        sizes="(min-width:1280px) 25vw, (min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
        className="object-cover"
        unoptimized
      />
    )
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-surface-muted">
      <span className="text-xs uppercase tracking-wider text-subtle">
        Video
      </span>
    </div>
  )
}

function PlayBadge() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm transition-transform group-hover:scale-110">
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="ml-0.5 h-5 w-5 fill-current"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </span>
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
            <video
              src={file.url}
              poster={file.posterUrl ?? undefined}
              controls
              playsInline
              preload="metadata"
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
