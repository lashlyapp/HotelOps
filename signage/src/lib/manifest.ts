import 'server-only'
import { createAdminClient } from './supabase'
import { r2PublicUrl } from './r2'

// Minimal row types — duplicated from the operator app's
// src/lib/supabase/types.ts intentionally. The signage project has a
// separate deploy lifecycle, so we don't want it tied to a shared type
// package or workspace yet.

type ItemKind = 'image' | 'video' | 'web' | 'text'

type SignageScreen = {
  id: string
  org_id: string
  property_id: string
  nickname: string
  player_token: string
  emergency_message: string | null
  emergency_until: string | null
  updated_at: string
}

type SignagePlaylist = {
  id: string
  property_id: string
  name: string
  is_default: boolean
  updated_at: string
}

type SignagePlaylistItem = {
  id: string
  playlist_id: string
  kind: ItemKind
  payload: Record<string, unknown>
  duration_seconds: number
  sort_order: number
}

type SignageSchedule = {
  id: string
  screen_id: string
  playlist_id: string
  starts_on: string | null
  ends_on: string | null
  start_time: string | null
  end_time: string | null
  priority: number
}

export type ResolvedItem = {
  id: string
  kind: ItemKind
  duration_seconds: number
  url?: string
  poster_url?: string | null
  heading?: string
  subheading?: string | null
  background?: string | null
  color?: string | null
}

export type Manifest = {
  generation: string
  screen: { id: string; nickname: string }
  playlist: { id: string; name: string } | null
  items: ResolvedItem[]
  emergency: { message: string; until: string } | null
  poll_ms: number
}

export type LoadResult =
  | { ok: true; manifest: Manifest; screen: SignageScreen }
  | { ok: false; reason: 'not_found' }

/**
 * Resolve the active manifest for a screen token. Walks schedules
 * (highest-priority overlap with "now" wins), falls back to the
 * property's default playlist, expands R2 keys into CDN URLs so the
 * player consumes URLs directly. Returns a stable `generation` string
 * so the player can no-op when nothing changed between polls.
 */
export async function loadManifestByToken(token: string): Promise<LoadResult> {
  if (!token || token.length < 16) return { ok: false, reason: 'not_found' }
  const admin = createAdminClient()
  const { data: screenRow } = await admin
    .from('signage_screens')
    .select('*')
    .eq('player_token', token)
    .maybeSingle()
  if (!screenRow) return { ok: false, reason: 'not_found' }
  const screen = screenRow as SignageScreen

  const [{ data: scheduleRows }, { data: playlistRows }] = await Promise.all([
    admin
      .from('signage_schedules')
      .select('*')
      .eq('screen_id', screen.id)
      .order('priority', { ascending: false }),
    admin
      .from('signage_playlists')
      .select('*')
      .eq('property_id', screen.property_id),
  ])

  const playlists = (playlistRows ?? []) as SignagePlaylist[]
  const schedules = (scheduleRows ?? []) as SignageSchedule[]
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const hhmm = now.toTimeString().slice(0, 5)

  let active: SignagePlaylist | null = null
  for (const s of schedules) {
    if (s.starts_on && s.starts_on > today) continue
    if (s.ends_on && s.ends_on < today) continue
    if (s.start_time && s.end_time) {
      // If start <= end the window is intra-day. If start > end the window
      // wraps midnight (e.g. 22:00–06:00 night-mode signage).
      const inWindow =
        s.start_time <= s.end_time
          ? hhmm >= s.start_time && hhmm <= s.end_time
          : hhmm >= s.start_time || hhmm <= s.end_time
      if (!inWindow) continue
    }
    active = playlists.find((p) => p.id === s.playlist_id) ?? null
    if (active) break
  }
  if (!active) {
    active = playlists.find((p) => p.is_default) ?? null
  }

  let items: ResolvedItem[] = []
  if (active) {
    const { data: itemRows } = await admin
      .from('signage_playlist_items')
      .select('*')
      .eq('playlist_id', active.id)
      .order('sort_order', { ascending: true })
    items = ((itemRows ?? []) as SignagePlaylistItem[]).map(resolveItem)
  }

  const emergencyActive =
    screen.emergency_until && new Date(screen.emergency_until) > now
      ? {
          message: screen.emergency_message ?? '',
          until: screen.emergency_until!,
        }
      : null

  return {
    ok: true,
    screen,
    manifest: {
      generation: deriveGeneration(screen, active, items),
      screen: { id: screen.id, nickname: screen.nickname },
      playlist: active ? { id: active.id, name: active.name } : null,
      items,
      emergency: emergencyActive,
      poll_ms: 60_000,
    },
  }
}

function resolveItem(row: SignagePlaylistItem): ResolvedItem {
  const base = {
    id: row.id,
    kind: row.kind,
    duration_seconds: row.duration_seconds,
  }
  switch (row.kind) {
    case 'image':
    case 'video': {
      const payload = row.payload as {
        r2_key: string
        poster_key?: string | null
      }
      return {
        ...base,
        url: r2PublicUrl(payload.r2_key),
        poster_url: payload.poster_key ? r2PublicUrl(payload.poster_key) : null,
      }
    }
    case 'web': {
      const payload = row.payload as { url: string }
      return { ...base, url: payload.url }
    }
    case 'text': {
      const payload = row.payload as {
        heading: string
        subheading?: string | null
        background?: string | null
        color?: string | null
      }
      return {
        ...base,
        heading: payload.heading,
        subheading: payload.subheading ?? null,
        background: payload.background ?? null,
        color: payload.color ?? null,
      }
    }
  }
}

function deriveGeneration(
  screen: SignageScreen,
  playlist: SignagePlaylist | null,
  items: ResolvedItem[],
): string {
  return [
    screen.updated_at,
    screen.emergency_until ?? '0',
    playlist?.id ?? 'none',
    playlist?.updated_at ?? '0',
    String(items.length),
  ].join('|')
}
