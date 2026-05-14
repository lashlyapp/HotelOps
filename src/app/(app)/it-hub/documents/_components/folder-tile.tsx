'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteFolderAction, renameFolderAction } from '../actions'

export function FolderTile({
  id,
  name,
  docCount,
  childFolderCount,
  hrefIn,
}: {
  id: string
  name: string
  docCount: number
  childFolderCount: number
  hrefIn: string
}) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function commitRename() {
    setError(null)
    const next = draftName.trim()
    if (!next || next === name) {
      setEditing(false)
      setDraftName(name)
      return
    }
    startTransition(async () => {
      const result = await renameFolderAction({ id, name: next })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <div className="group relative flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface p-3 transition-colors hover:bg-surface-muted">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            commitRename()
          }}
          className="space-y-1"
        >
          <Input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setEditing(false)
                setDraftName(name)
                setError(null)
              }
            }}
            disabled={pending}
          />
          {error ? (
            <p className="text-xs text-danger-fg">{error}</p>
          ) : null}
        </form>
      ) : (
        <a
          href={hrefIn}
          className="focus-ring -m-1 flex items-center gap-2 rounded-md p-1 text-sm font-medium text-fg"
        >
          <FolderIcon />
          <span className="min-w-0 flex-1 truncate" title={name}>
            {name}
          </span>
        </a>
      )}
      <p className="pl-7 text-xs text-subtle">
        {childFolderCount > 0
          ? `${childFolderCount} ${childFolderCount === 1 ? 'folder' : 'folders'} · `
          : ''}
        {docCount} {docCount === 1 ? 'doc' : 'docs'}
      </p>
      {!editing ? (
        <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
          <button
            type="button"
            onClick={() => {
              setDraftName(name)
              setEditing(true)
            }}
            className="focus-ring rounded-sm px-1.5 py-0.5 text-xs text-muted hover:text-fg"
          >
            Rename
          </button>
          <form
            action={deleteFolderAction}
            onSubmit={(e) => {
              const message =
                docCount + childFolderCount > 0
                  ? `Delete "${name}"? Subfolders are removed; documents inside become unfiled.`
                  : `Delete "${name}"?`
              if (!confirm(message)) e.preventDefault()
            }}
          >
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              className="focus-ring rounded-sm px-1.5 py-0.5 text-xs text-muted hover:text-danger-fg"
            >
              Delete
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}

function FolderIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className="size-5 shrink-0 text-muted"
      fill="currentColor"
    >
      <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h3.379a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 10.12 6H16.5A1.5 1.5 0 0 1 18 7.5v7A1.5 1.5 0 0 1 16.5 16h-13A1.5 1.5 0 0 1 2 14.5v-9Z" />
    </svg>
  )
}
