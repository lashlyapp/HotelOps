'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type {
  Property,
  TaskCategory,
  TaskPriority,
} from '@/lib/supabase/types'
import { createTaskAction } from '../actions'
import {
  CATEGORIES,
  CATEGORY_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
} from '../_lib/labels'
import { CaptureUploader, type UploadedAttachment } from './capture-uploader'

const STORAGE_KEY = 'tasks:new-form'

type DraftState = {
  propertyId: string
  category: TaskCategory
  priority: TaskPriority
  location: string
}

export function NewTaskForm({
  properties,
  defaultPropertyId,
}: {
  properties: Property[]
  defaultPropertyId?: string
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<DraftState>(() =>
    // Restore the last property/category/location/priority — same hand on
    // the same floor often files multiple tickets in a row, no point
    // making them re-pick every time. Reads `localStorage` synchronously
    // before the first render so the form mounts in its final state.
    loadDraft(properties, defaultPropertyId),
  )
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([])
  const [taskId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const property = useMemo(
    () => properties.find((p) => p.id === draft.propertyId) ?? null,
    [draft.propertyId, properties],
  )

  function persistDraft(next: DraftState) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // private mode, etc. — fine to drop.
    }
  }

  function suggestedTitle(): string {
    const cat = CATEGORY_LABELS[draft.category]
    const loc = draft.location.trim()
    if (loc) return `${cat} at ${loc}`
    return cat
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!property) {
      setError('Choose a property.')
      return
    }
    const finalTitle = title.trim() || suggestedTitle()
    persistDraft(draft)
    startTransition(async () => {
      const result = await createTaskAction({
        id: taskId,
        propertyId: property.id,
        title: finalTitle,
        description: description.trim() || null,
        category: draft.category,
        priority: draft.priority,
        location: draft.location.trim() || null,
        attachments: attachments.map((a) => ({
          kind: a.kind,
          r2Key: a.r2Key,
          posterKey: a.posterKey,
          filename: a.filename,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
        })),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/tasks/${result.id}`)
    })
  }

  if (properties.length === 0) {
    return (
      <p className="text-sm text-muted">
        Add a property first, then come back to create a task.
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="space-y-2">
        <Label>Evidence</Label>
        <p className="text-xs text-muted">
          The photo or short video is the work order — take it before you
          write anything.
        </p>
        {property ? (
          <CaptureUploader
            propertyId={property.id}
            taskId={taskId}
            onChange={setAttachments}
          />
        ) : null}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="property">Property</Label>
          <select
            id="property"
            value={draft.propertyId}
            onChange={(e) =>
              setDraft((d) => ({ ...d, propertyId: e.target.value }))
            }
            className="focus-ring h-10 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location">Location (room, area)</Label>
          <Input
            id="location"
            placeholder="Room 312, Pool deck, Lobby…"
            value={draft.location}
            onChange={(e) =>
              setDraft((d) => ({ ...d, location: e.target.value }))
            }
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            value={draft.category}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                category: e.target.value as TaskCategory,
              }))
            }
            className="focus-ring h-10 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="priority">Priority</Label>
          <select
            id="priority"
            value={draft.priority}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                priority: e.target.value as TaskPriority,
              }))
            }
            className="focus-ring h-10 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="title">
          Title <span className="text-xs text-subtle">(optional)</span>
        </Label>
        <Input
          id="title"
          placeholder={suggestedTitle()}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
        <p className="text-[11px] text-subtle">
          Leave blank to use “{suggestedTitle()}”.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">
          Notes <span className="text-xs text-subtle">(optional)</span>
        </Label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
          rows={3}
          placeholder="Anything the photo doesn't show?"
          className="focus-ring w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg"
        />
      </div>

      {error ? (
        <p className="text-sm text-danger-fg" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Create task'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push('/tasks')}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

function loadDraft(
  properties: Property[],
  defaultPropertyId: string | undefined,
): DraftState {
  const fallback: DraftState = {
    propertyId: defaultPropertyId ?? properties[0]?.id ?? '',
    category: 'guest_request',
    priority: 'normal',
    location: '',
  }
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<DraftState>
    return {
      propertyId:
        parsed.propertyId &&
        properties.some((p) => p.id === parsed.propertyId)
          ? parsed.propertyId
          : fallback.propertyId,
      category:
        parsed.category && (CATEGORIES as string[]).includes(parsed.category)
          ? (parsed.category as TaskCategory)
          : fallback.category,
      priority:
        parsed.priority && (PRIORITIES as string[]).includes(parsed.priority)
          ? (parsed.priority as TaskPriority)
          : fallback.priority,
      location: typeof parsed.location === 'string' ? parsed.location : '',
    }
  } catch {
    return fallback
  }
}
