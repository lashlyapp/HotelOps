'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { MediaFile } from '@/lib/r2/list'
import type {
  ArrivalMenuGroup,
  ArrivalMenuItem,
} from '@/lib/supabase/types'
import {
  addMenuGroupAction,
  addMenuItemAction,
  deleteMenuGroupAction,
  deleteMenuItemAction,
  renameMenuGroupAction,
  updateMenuItemAction,
  type MenuItemInput,
} from '../../../actions'

export function MenuEditor({
  sectionId,
  groups,
  photoFiles,
}: {
  sectionId: string
  groups: ArrivalMenuGroup[]
  photoFiles: MediaFile[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [newGroupName, setNewGroupName] = useState('')

  function refresh() {
    router.refresh()
  }
  function wrap(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) setError(res.error)
      else refresh()
    })
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p className="text-sm text-danger-fg" role="alert">
          {error}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <p className="text-sm text-muted">
          No groups yet — add one below (e.g. &quot;Breakfast&quot;, &quot;Lunch&quot;).
        </p>
      ) : (
        <ul className="space-y-4">
          {groups.map((group) => (
            <li
              key={group.id}
              className="rounded-md border border-border-subtle bg-surface p-3"
            >
              <GroupBlock
                group={group}
                photoFiles={photoFiles}
                busy={pending}
                onRename={(name) =>
                  wrap(() =>
                    renameMenuGroupAction({
                      sectionId,
                      groupId: group.id,
                      name,
                    }),
                  )
                }
                onDelete={() =>
                  wrap(() =>
                    deleteMenuGroupAction({ sectionId, groupId: group.id }),
                  )
                }
                onAddItem={(item) =>
                  wrap(() =>
                    addMenuItemAction({
                      sectionId,
                      groupId: group.id,
                      item,
                    }),
                  )
                }
                onUpdateItem={(itemId, item) =>
                  wrap(() =>
                    updateMenuItemAction({
                      sectionId,
                      groupId: group.id,
                      itemId,
                      item,
                    }),
                  )
                }
                onDeleteItem={(itemId) =>
                  wrap(() =>
                    deleteMenuItemAction({
                      sectionId,
                      groupId: group.id,
                      itemId,
                    }),
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2 border-t border-border-subtle pt-4">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="new-group">New group</Label>
          <Input
            id="new-group"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Breakfast, Lunch, Drinks…"
            maxLength={120}
          />
        </div>
        <Button
          size="sm"
          disabled={pending || !newGroupName.trim()}
          onClick={() => {
            const name = newGroupName.trim()
            wrap(() => addMenuGroupAction({ sectionId, name }))
            setNewGroupName('')
          }}
        >
          Add group
        </Button>
      </div>
    </div>
  )
}

function GroupBlock({
  group,
  photoFiles,
  busy,
  onRename,
  onDelete,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
}: {
  group: ArrivalMenuGroup
  photoFiles: MediaFile[]
  busy: boolean
  onRename: (name: string) => void
  onDelete: () => void
  onAddItem: (item: MenuItemInput) => void
  onUpdateItem: (itemId: string, item: MenuItemInput) => void
  onDeleteItem: (itemId: string) => void
}) {
  const [name, setName] = useState(group.name)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor={`group-${group.id}`}>Group name</Label>
          <Input
            id={`group-${group.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || !name.trim() || name.trim() === group.name}
          onClick={() => onRename(name.trim())}
        >
          Rename
        </Button>
        <button
          type="button"
          onClick={onDelete}
          className="focus-ring rounded-sm text-xs text-muted hover:text-danger-fg"
        >
          Delete group
        </button>
      </div>

      <ul className="space-y-2">
        {group.items.map((item) => (
          <MenuItemRow
            key={item.id}
            item={item}
            photoFiles={photoFiles}
            busy={busy}
            onSave={(patch) => onUpdateItem(item.id, patch)}
            onDelete={() => onDeleteItem(item.id)}
          />
        ))}
      </ul>

      <BlankItemRow
        photoFiles={photoFiles}
        busy={busy}
        onAdd={(item) => onAddItem(item)}
      />
    </div>
  )
}

function MenuItemRow({
  item,
  photoFiles,
  busy,
  onSave,
  onDelete,
}: {
  item: ArrivalMenuItem
  photoFiles: MediaFile[]
  busy: boolean
  onSave: (patch: MenuItemInput) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState<MenuItemInput>({
    name: item.name,
    description: item.description ?? '',
    price: item.price ?? '',
    image_key: item.image_key ?? '',
    diet: item.diet ?? [],
  })
  return (
    <li className="rounded-md border border-border-subtle bg-surface-muted/40 p-3 space-y-2">
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
    </li>
  )
}

function BlankItemRow({
  photoFiles,
  busy,
  onAdd,
}: {
  photoFiles: MediaFile[]
  busy: boolean
  onAdd: (item: MenuItemInput) => void
}) {
  const [draft, setDraft] = useState<MenuItemInput>({
    name: '',
    description: '',
    price: '',
    image_key: '',
    diet: [],
  })
  return (
    <div className="rounded-md border border-dashed border-border-default p-3 space-y-2">
      <Fields draft={draft} setDraft={setDraft} photoFiles={photoFiles} />
      <Button
        size="sm"
        disabled={busy || !(draft.name ?? '').trim()}
        onClick={() => {
          onAdd(draft)
          setDraft({
            name: '',
            description: '',
            price: '',
            image_key: '',
            diet: [],
          })
        }}
      >
        Add item
      </Button>
    </div>
  )
}

function Fields({
  draft,
  setDraft,
  photoFiles,
}: {
  draft: MenuItemInput
  setDraft: (next: MenuItemInput) => void
  photoFiles: MediaFile[]
}) {
  function patch(p: Partial<MenuItemInput>) {
    setDraft({ ...draft, ...p })
  }
  const dietCsv = (draft.diet ?? []).join(', ')
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2">
          <Label>Name</Label>
          <Input
            value={draft.name ?? ''}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Buttermilk pancakes"
            maxLength={120}
          />
        </div>
        <div className="space-y-1">
          <Label>Price</Label>
          <Input
            value={draft.price ?? ''}
            onChange={(e) => patch({ price: e.target.value })}
            placeholder="$14"
            maxLength={32}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Input
          value={draft.description ?? ''}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="Maple syrup, berries, whipped butter"
          maxLength={500}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Photo (optional)</Label>
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
        </div>
        <div className="space-y-1">
          <Label>Dietary (comma-separated)</Label>
          <Input
            value={dietCsv}
            onChange={(e) =>
              patch({
                diet: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="V, GF"
            maxLength={120}
          />
        </div>
      </div>
    </div>
  )
}
