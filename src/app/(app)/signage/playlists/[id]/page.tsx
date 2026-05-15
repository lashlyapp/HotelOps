import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { listMediaWithTags } from '@/lib/r2/list'
import { r2PublicUrl } from '@/lib/r2/client'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  SignagePlaylist,
  SignagePlaylistItem,
} from '@/lib/supabase/types'
import {
  deleteItemAction,
  deletePlaylistAction,
  reorderItemAction,
} from '../../actions'
import { ITEM_KIND_LABELS } from '../../_lib/labels'
import { AddItemForm } from './add-item-form'
import { PlaylistMetaForm } from './playlist-meta-form'

export default async function PlaylistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireOrgUser()
  const admin = createAdminClient()
  const { data: playlistRow } = await admin
    .from('signage_playlists')
    .select('*')
    .eq('id', id)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!playlistRow) notFound()
  const playlist = playlistRow as SignagePlaylist
  const property = session.properties.find((p) => p.id === playlist.property_id)

  const [{ data: itemRows }, files] = await Promise.all([
    admin
      .from('signage_playlist_items')
      .select('*')
      .eq('playlist_id', playlist.id)
      .order('sort_order', { ascending: true }),
    property
      ? listMediaWithTags(property.id, property.r2_prefix)
      : Promise.resolve([]),
  ])
  const items = (itemRows ?? []) as SignagePlaylistItem[]
  const isOwner = session.profile.role === 'org_owner'

  return (
    <div className="p-4 sm:p-8 space-y-5 max-w-5xl">
      <div>
        <Link
          href="/signage/playlists"
          className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
        >
          ← Back to playlists
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight text-fg">
            {playlist.name}
          </h2>
          {playlist.is_default ? <Badge tone="info">Default</Badge> : null}
        </div>
        <p className="mt-1 text-xs text-subtle">
          {property?.name ?? 'Unknown property'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardBody>
          <PlaylistMetaForm
            properties={session.properties}
            playlist={playlist}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items ({items.length})</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted">No items yet. Add one below.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item, idx) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  isFirst={idx === 0}
                  isLast={idx === items.length - 1}
                />
              ))}
            </ul>
          )}

          <div className="border-t border-border-subtle pt-4">
            <h4 className="mb-2 text-sm font-semibold text-fg">Add an item</h4>
            <AddItemForm playlistId={playlist.id} mediaFiles={files} />
          </div>
        </CardBody>
      </Card>

      {isOwner ? (
        <Card>
          <CardBody>
            <form action={deletePlaylistAction}>
              <input type="hidden" name="id" value={playlist.id} />
              <button
                type="submit"
                className="focus-ring rounded-sm text-sm font-medium text-danger-fg hover:underline"
              >
                Delete playlist
              </button>
            </form>
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}

function ItemRow({
  item,
  isFirst,
  isLast,
}: {
  item: SignagePlaylistItem
  isFirst: boolean
  isLast: boolean
}) {
  const thumbUrl = thumbnailFor(item)
  return (
    <li className="flex items-center gap-3 rounded-md border border-border-subtle bg-surface p-2">
      <div className="h-16 w-24 shrink-0 overflow-hidden rounded bg-surface-muted">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
        ) : item.kind === 'text' ? (
          <PreviewText item={item} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase text-subtle">
            {item.kind}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-fg">
          {ITEM_KIND_LABELS[item.kind]}{' '}
          <span className="text-xs text-subtle">
            · {item.duration_seconds}s
          </span>
        </p>
        <p className="truncate text-xs text-muted" title={describePayload(item)}>
          {describePayload(item)}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <form action={reorderItemAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="direction" value="up" />
          <button
            type="submit"
            disabled={isFirst}
            className="focus-ring rounded-sm px-2 py-1 text-xs text-muted hover:bg-surface-muted hover:text-fg disabled:opacity-30"
            aria-label="Move up"
          >
            ↑
          </button>
        </form>
        <form action={reorderItemAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="direction" value="down" />
          <button
            type="submit"
            disabled={isLast}
            className="focus-ring rounded-sm px-2 py-1 text-xs text-muted hover:bg-surface-muted hover:text-fg disabled:opacity-30"
            aria-label="Move down"
          >
            ↓
          </button>
        </form>
        <form action={deleteItemAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="playlist_id" value={item.playlist_id} />
          <button
            type="submit"
            className="focus-ring rounded-sm px-2 py-1 text-xs text-muted hover:text-danger-fg"
            aria-label="Delete"
          >
            ✕
          </button>
        </form>
      </div>
    </li>
  )
}

function thumbnailFor(item: SignagePlaylistItem): string | null {
  const payload = item.payload as Record<string, unknown>
  if (item.kind === 'image') {
    const k = typeof payload.r2_key === 'string' ? payload.r2_key : ''
    return k ? r2PublicUrl(k) : null
  }
  if (item.kind === 'video') {
    const poster =
      typeof payload.poster_key === 'string' ? payload.poster_key : null
    return poster ? r2PublicUrl(poster) : null
  }
  return null
}

function describePayload(item: SignagePlaylistItem): string {
  const payload = item.payload as Record<string, unknown>
  switch (item.kind) {
    case 'image':
    case 'video':
      return typeof payload.r2_key === 'string' ? payload.r2_key : ''
    case 'web':
      return typeof payload.url === 'string' ? payload.url : ''
    case 'text':
      return typeof payload.heading === 'string' ? payload.heading : ''
  }
}

function PreviewText({ item }: { item: SignagePlaylistItem }) {
  const p = item.payload as { heading?: string; background?: string; color?: string }
  return (
    <div
      className="flex h-full w-full items-center justify-center text-center text-[10px] font-medium"
      style={{ background: p.background ?? '#0F172A', color: p.color ?? '#fff' }}
    >
      {(p.heading ?? '').slice(0, 18)}
    </div>
  )
}
