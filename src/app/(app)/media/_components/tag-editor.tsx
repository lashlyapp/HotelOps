'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils/cn'
import { addTagAction, removeTagAction } from '@/lib/media/actions'

export function TagEditor({
  propertyId,
  fileKey,
  initialTags,
  onChange,
}: {
  propertyId: string
  fileKey: string
  initialTags: string[]
  onChange?: (tags: string[]) => void
}) {
  const [tags, setTags] = useState<string[]>(initialTags)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function commit(next: string[]) {
    setTags(next)
    onChange?.(next)
  }

  async function add() {
    const value = draft.trim()
    if (!value) {
      setAdding(false)
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await addTagAction({ propertyId, key: fileKey, tag: value })
      if (res.ok) {
        commit(res.tags)
        setDraft('')
        setAdding(false)
      } else {
        setError(res.error)
      }
    })
  }

  async function remove(tag: string) {
    setError(null)
    startTransition(async () => {
      const res = await removeTagAction({
        propertyId,
        key: fileKey,
        tag,
      })
      if (res.ok) commit(res.tags)
      else setError(res.error)
    })
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <TagChip key={tag} tag={tag} onRemove={() => remove(tag)} />
        ))}
        {adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              } else if (e.key === 'Escape') {
                setAdding(false)
                setDraft('')
                setError(null)
              }
            }}
            placeholder="tag"
            className="h-6 w-24 rounded-full border border-border-default bg-surface px-2 text-xs text-fg focus-ring"
            maxLength={30}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(
              'inline-flex items-center rounded-full border border-dashed border-border-default px-2 py-0.5 text-xs text-muted hover:text-fg hover:border-border-strong',
              'focus-ring',
            )}
          >
            + tag
          </button>
        )}
      </div>
      {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
    </div>
  )
}

function TagChip({
  tag,
  onRemove,
}: {
  tag: string
  onRemove: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-fg">
      <span>{tag}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove tag ${tag}`}
        className="focus-ring rounded-full text-subtle hover:text-fg"
      >
        ×
      </button>
    </span>
  )
}
