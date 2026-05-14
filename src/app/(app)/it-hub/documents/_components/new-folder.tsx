'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createFolderAction } from '../actions'

export function NewFolderButton({ parentId }: { parentId: string | null }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function reset() {
    setName('')
    setError(null)
    setOpen(false)
  }

  function submit() {
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Folder name is required.')
      return
    }
    startTransition(async () => {
      const result = await createFolderAction({ name: trimmed, parentId })
      if (!result.ok) {
        setError(result.error)
        return
      }
      reset()
      router.refresh()
    })
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        New folder
      </Button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex flex-wrap items-start gap-2"
    >
      <div className="space-y-1">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Folder name"
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === 'Escape') reset()
          }}
        />
        {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Creating…' : 'Create'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={reset}
        disabled={pending}
      >
        Cancel
      </Button>
    </form>
  )
}
