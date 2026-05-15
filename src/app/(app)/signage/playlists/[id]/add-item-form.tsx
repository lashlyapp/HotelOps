'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { MediaFile } from '@/lib/r2/list'
import type { SignageItemKind } from '@/lib/supabase/types'
import { addItemAction, type ActionResult } from '../../actions'
import {
  DEFAULT_DURATION_SECONDS,
  ITEM_KINDS,
  ITEM_KIND_LABELS,
} from '../../_lib/labels'

export function AddItemForm({
  playlistId,
  mediaFiles,
}: {
  playlistId: string
  mediaFiles: MediaFile[]
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    addItemAction,
    {},
  )
  const [kind, setKind] = useState<SignageItemKind>('image')

  const images = mediaFiles.filter((f) =>
    (f.contentType ?? '').startsWith('image/'),
  )
  const videos = mediaFiles.filter((f) =>
    (f.contentType ?? '').startsWith('video/'),
  )

  return (
    <form action={action} className="space-y-3 rounded-md border border-border-subtle bg-surface p-3">
      <input type="hidden" name="playlist_id" value={playlistId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="kind">Item type</Label>
          <select
            id="kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as SignageItemKind)}
            className="focus-ring h-10 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg"
          >
            {ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {ITEM_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="duration_seconds">Duration (sec)</Label>
          <Input
            id="duration_seconds"
            name="duration_seconds"
            type="number"
            min={2}
            max={600}
            defaultValue={DEFAULT_DURATION_SECONDS[kind]}
            key={kind} // reset default on kind change
          />
        </div>
      </div>

      {kind === 'image' ? (
        <MediaPicker
          name="r2_key"
          files={images}
          label="Image (from media library)"
          empty="No images in this property's library yet. Upload one in /media first."
        />
      ) : null}
      {kind === 'video' ? (
        <MediaPicker
          name="r2_key"
          files={videos}
          label="Video (from media library)"
          empty="No videos in this property's library yet."
        />
      ) : null}
      {kind === 'web' ? (
        <div className="space-y-1.5">
          <Label htmlFor="url">URL (https only)</Label>
          <Input
            id="url"
            name="url"
            type="url"
            placeholder="https://example.com/dashboard"
          />
          <p className="text-[11px] text-subtle">
            The page renders inside a sandboxed iframe. Pick URLs you trust.
          </p>
        </div>
      ) : null}
      {kind === 'text' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="heading">Heading</Label>
            <Input
              id="heading"
              name="heading"
              placeholder="Welcome to The Bayside"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="subheading">Subheading</Label>
            <Input
              id="subheading"
              name="subheading"
              placeholder="Breakfast 7–10 AM in The Garden Room"
              maxLength={240}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="background">Background color</Label>
            <Input
              id="background"
              name="background"
              type="text"
              placeholder="#0F172A"
              maxLength={32}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="color">Text color</Label>
            <Input
              id="color"
              name="color"
              type="text"
              placeholder="#FFFFFF"
              maxLength={32}
            />
          </div>
        </div>
      ) : null}

      {state.error ? (
        <p className="text-sm text-danger-fg" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Adding…' : 'Add item'}
      </Button>
    </form>
  )
}

function MediaPicker({
  name,
  files,
  label,
  empty,
}: {
  name: string
  files: MediaFile[]
  label: string
  empty: string
}) {
  if (files.length === 0) {
    return <p className="text-sm text-muted">{empty}</p>
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        required
        className="focus-ring h-10 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg"
      >
        <option value="">Choose a file…</option>
        {files.map((f) => (
          <option key={f.key} value={f.key}>
            {f.displayName}
          </option>
        ))}
      </select>
    </div>
  )
}
