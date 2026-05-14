'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { MediaFile } from '@/lib/r2/list'
import { clientR2PublicUrl } from '../../../_lib/public-url'
import type {
  ArrivalInfoItem,
  ArrivalSectionKind,
} from '@/lib/supabase/types'
import {
  addInfoItemAction,
  deleteInfoItemAction,
  updateInfoItemAction,
  type InfoItemInput,
} from '../../../actions'

const PLACEHOLDERS: Record<ArrivalSectionKind, Partial<ArrivalInfoItem>> = {
  info: {
    title: 'Breakfast',
    subtitle: 'The Garden Room',
    hours: '7:00–10:00 AM',
    body: 'Continental buffet included with stay.',
  },
  event: {
    title: 'Sunset Farmers Market',
    subtitle: 'Saturdays, May–October',
    body: 'Two blocks south on Ocean Ave.',
  },
  marketing: {
    title: 'Date night dinner',
    subtitle: '3 courses · $79 per person',
    body: 'Mon–Thu in The Garden Room. Ask the front desk to reserve.',
  },
  menu: {
    title: '',
  },
}

export function InfoEditor({
  sectionId,
  kind,
  items,
  photoFiles,
}: {
  sectionId: string
  kind: ArrivalSectionKind
  items: ArrivalInfoItem[]
  photoFiles: MediaFile[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const placeholder = PLACEHOLDERS[kind]

  function refresh() {
    router.refresh()
  }

  function runAdd(item: InfoItemInput) {
    setError(null)
    startTransition(async () => {
      const res = await addInfoItemAction({ sectionId, item })
      if (!res.ok) setError(res.error)
      else refresh()
    })
  }
  function runUpdate(itemId: string, item: InfoItemInput) {
    setError(null)
    startTransition(async () => {
      const res = await updateInfoItemAction({ sectionId, itemId, item })
      if (!res.ok) setError(res.error)
      else refresh()
    })
  }
  function runDelete(itemId: string) {
    setError(null)
    startTransition(async () => {
      const res = await deleteInfoItemAction({ sectionId, itemId })
      if (!res.ok) setError(res.error)
      else refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm text-danger-fg" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-md border border-border-subtle bg-surface p-3"
          >
            <ItemRow
              item={item}
              photoFiles={photoFiles}
              busy={pending}
              onSave={(patch) => runUpdate(item.id, patch)}
              onDelete={() => runDelete(item.id)}
            />
          </li>
        ))}
      </ul>

      <div className="rounded-md border border-dashed border-border-default p-3">
        <h4 className="mb-2 text-sm font-semibold text-fg">Add an item</h4>
        <BlankRow
          placeholder={placeholder}
          photoFiles={photoFiles}
          busy={pending}
          onSave={runAdd}
        />
      </div>
    </div>
  )
}

function ItemRow({
  item,
  photoFiles,
  busy,
  onSave,
  onDelete,
}: {
  item: ArrivalInfoItem
  photoFiles: MediaFile[]
  busy: boolean
  onSave: (patch: InfoItemInput) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState<InfoItemInput>({
    title: item.title,
    subtitle: item.subtitle ?? '',
    body: item.body ?? '',
    hours: item.hours ?? '',
    image_key: item.image_key ?? '',
    url: item.url ?? '',
  })
  return (
    <div className="space-y-2">
      <Fields draft={draft} setDraft={setDraft} photoFiles={photoFiles} />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => onSave(draft)}
        >
          Save
        </Button>
        <button
          type="button"
          onClick={onDelete}
          className="focus-ring rounded-sm text-xs text-muted hover:text-danger-fg"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function BlankRow({
  placeholder,
  photoFiles,
  busy,
  onSave,
}: {
  placeholder: Partial<ArrivalInfoItem>
  photoFiles: MediaFile[]
  busy: boolean
  onSave: (item: InfoItemInput) => void
}) {
  const [draft, setDraft] = useState<InfoItemInput>({
    title: '',
    subtitle: '',
    body: '',
    hours: '',
    image_key: '',
    url: '',
  })
  return (
    <div className="space-y-2">
      <Fields
        draft={draft}
        setDraft={setDraft}
        photoFiles={photoFiles}
        placeholder={placeholder}
      />
      <Button
        size="sm"
        disabled={busy || !((draft.title ?? '').trim())}
        onClick={() => {
          onSave(draft)
          setDraft({
            title: '',
            subtitle: '',
            body: '',
            hours: '',
            image_key: '',
            url: '',
          })
        }}
      >
        Add
      </Button>
    </div>
  )
}

function Fields({
  draft,
  setDraft,
  photoFiles,
  placeholder,
}: {
  draft: InfoItemInput
  setDraft: (next: InfoItemInput) => void
  photoFiles: MediaFile[]
  placeholder?: Partial<ArrivalInfoItem>
}) {
  function patch(p: Partial<InfoItemInput>) {
    setDraft({ ...draft, ...p })
  }
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="title">Title</Label>
          <Input
            value={draft.title ?? ''}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder={placeholder?.title ?? ''}
            maxLength={200}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="subtitle">Subtitle</Label>
          <Input
            value={draft.subtitle ?? ''}
            onChange={(e) => patch({ subtitle: e.target.value })}
            placeholder={placeholder?.subtitle ?? ''}
            maxLength={200}
          />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="hours">Hours</Label>
          <Input
            value={draft.hours ?? ''}
            onChange={(e) => patch({ hours: e.target.value })}
            placeholder={placeholder?.hours ?? ''}
            maxLength={200}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="url">Link (optional)</Label>
          <Input
            value={draft.url ?? ''}
            onChange={(e) => patch({ url: e.target.value })}
            placeholder="https://"
            maxLength={500}
            type="url"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="body">Description</Label>
        <textarea
          value={draft.body ?? ''}
          onChange={(e) => patch({ body: e.target.value })}
          placeholder={placeholder?.body ?? ''}
          rows={2}
          maxLength={2000}
          className="focus-ring w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="image_key">Photo (optional)</Label>
        <select
          value={draft.image_key ?? ''}
          onChange={(e) => patch({ image_key: e.target.value })}
          className="focus-ring h-10 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg"
        >
          <option value="">None</option>
          {photoFiles.map((f) => (
            <option key={f.key} value={f.key}>
              {f.displayName}
            </option>
          ))}
        </select>
        {draft.image_key ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clientR2PublicUrl(draft.image_key)}
            alt=""
            className="mt-1 h-24 w-40 rounded-md object-cover"
          />
        ) : null}
      </div>
    </div>
  )
}
