'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  SignageItemKind,
  SignagePlaylist,
  SignageScreen,
} from '@/lib/supabase/types'
import { ITEM_KINDS } from './_lib/labels'

export type ActionResult = { error?: string; success?: string }

const PAIRING_TTL_MS = 10 * 60 * 1000
const TOKEN_BYTES = 24

function trim(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}
function trimOrNull(value: FormDataEntryValue | null): string | null {
  const v = trim(value)
  return v === '' ? null : v
}
function intOrDefault(value: FormDataEntryValue | null, def: number): number {
  const v = trim(value)
  if (v === '') return def
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : def
}
function randomToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}
function randomPairingCode(): string {
  // 6 decimal digits — friendly to enter on a TV remote.
  const n = randomBytes(4).readUInt32BE() % 1_000_000
  return String(n).padStart(6, '0')
}

async function ensurePropertyInOrg(
  orgId: string,
  propertyId: string,
): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .eq('org_id', orgId)
    .maybeSingle()
  return !!data
}

function revalidateAll() {
  revalidatePath('/signage')
  revalidatePath('/signage/playlists')
}

// ----------------------------------------------------------------------------
// Screens — pair, rename, unpair, broadcast
// ----------------------------------------------------------------------------
export async function startScreenPairingAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  void prev
  const propertyId = trim(formData.get('property_id'))
  const nickname = trim(formData.get('nickname'))
  if (!propertyId) return { error: 'Choose a property.' }
  if (!nickname) return { error: 'Give the screen a name (e.g. "Lobby TV").' }
  if (nickname.length > 80) return { error: 'Name is too long.' }
  if (!(await ensurePropertyInOrg(session.organization.id, propertyId))) {
    return { error: 'Property not found.' }
  }

  const code = randomPairingCode()
  const expires = new Date(Date.now() + PAIRING_TTL_MS).toISOString()
  const admin = createAdminClient()
  const { error } = await admin.from('signage_screens').insert({
    org_id: session.organization.id,
    property_id: propertyId,
    nickname,
    player_token: randomToken(),
    pairing_code: code,
    pairing_code_expires_at: expires,
  })
  if (error) return { error: error.message }
  revalidateAll()
  return { success: `Pairing code ${code} valid for 10 minutes.` }
}

export async function renameScreenAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  void prev
  const id = trim(formData.get('id'))
  const nickname = trim(formData.get('nickname'))
  if (!nickname) return { error: 'Name required.' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('signage_screens')
    .update({ nickname, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', session.organization.id)
  if (error) return { error: error.message }
  revalidateAll()
  return { success: 'Renamed.' }
}

export async function unpairScreenAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  const admin = createAdminClient()
  // Rotate the player_token so the old display URL stops working immediately.
  await admin
    .from('signage_screens')
    .update({
      player_token: randomToken(),
      pairing_code: null,
      pairing_code_expires_at: null,
      last_heartbeat_at: null,
      last_user_agent: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', session.organization.id)
  revalidateAll()
}

export async function deleteScreenAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  if (session.profile.role !== 'org_owner') {
    redirect('/signage?error=not_authorized')
  }
  const id = trim(formData.get('id'))
  const admin = createAdminClient()
  await admin
    .from('signage_screens')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)
  revalidateAll()
  redirect('/signage')
}

export async function broadcastEmergencyAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  if (session.profile.role !== 'org_owner') {
    return { error: 'Only owners can send emergency broadcasts.' }
  }
  void prev
  const propertyId = trim(formData.get('property_id'))
  const message = trim(formData.get('message'))
  const minutes = Math.min(Math.max(intOrDefault(formData.get('minutes'), 15), 1), 240)
  if (!propertyId) return { error: 'Choose a property.' }
  if (!message) return { error: 'Write a short message.' }
  if (message.length > 280) return { error: 'Keep it under 280 characters.' }

  const until = new Date(Date.now() + minutes * 60_000).toISOString()
  const admin = createAdminClient()
  const { error } = await admin
    .from('signage_screens')
    .update({
      emergency_message: message,
      emergency_until: until,
      updated_at: new Date().toISOString(),
    })
    .eq('property_id', propertyId)
    .eq('org_id', session.organization.id)
  if (error) return { error: error.message }
  revalidateAll()
  return {
    success: `Broadcast sent. Active for ${minutes} minutes.`,
  }
}

export async function clearEmergencyAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  const propertyId = trim(formData.get('property_id'))
  const admin = createAdminClient()
  await admin
    .from('signage_screens')
    .update({
      emergency_message: null,
      emergency_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('property_id', propertyId)
    .eq('org_id', session.organization.id)
  revalidateAll()
}

// ----------------------------------------------------------------------------
// Playlists
// ----------------------------------------------------------------------------
export async function savePlaylistAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  void prev
  const id = trim(formData.get('id'))
  const propertyId = trim(formData.get('property_id'))
  const name = trim(formData.get('name'))
  const isDefault = trim(formData.get('is_default')) === 'on'
  if (!propertyId) return { error: 'Choose a property.' }
  if (!name) return { error: 'Give the playlist a name.' }
  if (!(await ensurePropertyInOrg(session.organization.id, propertyId))) {
    return { error: 'Property not found.' }
  }
  const admin = createAdminClient()

  // Only one default per property — clear any other first if the operator
  // ticked the box.
  if (isDefault) {
    await admin
      .from('signage_playlists')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('property_id', propertyId)
      .eq('org_id', session.organization.id)
  }

  if (id) {
    const { error } = await admin
      .from('signage_playlists')
      .update({
        name,
        is_default: isDefault,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('org_id', session.organization.id)
    if (error) return { error: error.message }
    revalidateAll()
    return { success: 'Saved.' }
  }
  const { data, error } = await admin
    .from('signage_playlists')
    .insert({
      org_id: session.organization.id,
      property_id: propertyId,
      name,
      is_default: isDefault,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidateAll()
  redirect(`/signage/playlists/${data.id}`)
}

export async function deletePlaylistAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  const admin = createAdminClient()
  await admin
    .from('signage_playlists')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)
  revalidateAll()
  redirect('/signage/playlists')
}

// ----------------------------------------------------------------------------
// Playlist items
// ----------------------------------------------------------------------------
export async function addItemAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  void prev
  const playlistId = trim(formData.get('playlist_id'))
  const kind = trim(formData.get('kind')) as SignageItemKind
  if (!(ITEM_KINDS as string[]).includes(kind)) {
    return { error: 'Pick an item type.' }
  }
  const duration = Math.min(Math.max(intOrDefault(formData.get('duration_seconds'), 8), 2), 600)
  const admin = createAdminClient()

  const playlistResult = await admin
    .from('signage_playlists')
    .select('*')
    .eq('id', playlistId)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!playlistResult.data) return { error: 'Playlist not found.' }
  const playlist = playlistResult.data as SignagePlaylist

  let payload: Record<string, unknown> = {}
  if (kind === 'image' || kind === 'video') {
    const r2Key = trim(formData.get('r2_key'))
    if (!r2Key) return { error: 'Pick a media file.' }
    const property = session.properties.find((p) => p.id === playlist.property_id)
    if (!property || !r2Key.startsWith(property.r2_prefix)) {
      return { error: 'Media must belong to this property.' }
    }
    payload = { r2_key: r2Key, poster_key: trimOrNull(formData.get('poster_key')) }
  } else if (kind === 'web') {
    const url = trim(formData.get('url'))
    if (!url) return { error: 'Enter a URL.' }
    if (!/^https:\/\//i.test(url)) {
      return { error: 'Web items must be served over HTTPS.' }
    }
    payload = { url }
  } else if (kind === 'text') {
    const heading = trim(formData.get('heading'))
    if (!heading) return { error: 'Add a heading.' }
    const subheading = trimOrNull(formData.get('subheading'))
    const background = trimOrNull(formData.get('background'))
    const color = trimOrNull(formData.get('color'))
    payload = { heading, subheading, background, color }
  }

  // Sort order: append to the end.
  const tail = await admin
    .from('signage_playlist_items')
    .select('sort_order')
    .eq('playlist_id', playlistId)
    .order('sort_order', { ascending: false })
    .limit(1)
  const nextOrder = (tail.data?.[0]?.sort_order ?? -1) + 1

  const { error } = await admin.from('signage_playlist_items').insert({
    playlist_id: playlistId,
    org_id: session.organization.id,
    kind,
    payload,
    duration_seconds: duration,
    sort_order: nextOrder,
  })
  if (error) return { error: error.message }

  await admin
    .from('signage_playlists')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', playlistId)

  revalidatePath(`/signage/playlists/${playlistId}`)
  return { success: 'Added.' }
}

export async function deleteItemAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  const playlistId = trim(formData.get('playlist_id'))
  const admin = createAdminClient()
  await admin
    .from('signage_playlist_items')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)
  if (playlistId) {
    await admin
      .from('signage_playlists')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', playlistId)
    revalidatePath(`/signage/playlists/${playlistId}`)
  }
}

export async function reorderItemAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  const direction = trim(formData.get('direction'))
  if (direction !== 'up' && direction !== 'down') return
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('signage_playlist_items')
    .select('*')
    .eq('id', id)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!row) return
  const { data: siblings } = await admin
    .from('signage_playlist_items')
    .select('id, sort_order')
    .eq('playlist_id', row.playlist_id)
    .order('sort_order', { ascending: true })
  const list = siblings ?? []
  const idx = list.findIndex((s) => s.id === id)
  if (idx < 0) return
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= list.length) return
  const a = list[idx]!
  const b = list[swapIdx]!
  // Swap sort_order between the two rows. Two writes; the player polls
  // once a minute so a brief inconsistency is invisible.
  await admin
    .from('signage_playlist_items')
    .update({ sort_order: b.sort_order })
    .eq('id', a.id)
  await admin
    .from('signage_playlist_items')
    .update({ sort_order: a.sort_order })
    .eq('id', b.id)
  await admin
    .from('signage_playlists')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', row.playlist_id)
  revalidatePath(`/signage/playlists/${row.playlist_id}`)
}

// ----------------------------------------------------------------------------
// Schedules
// ----------------------------------------------------------------------------
export async function saveScheduleAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  void prev
  const screenId = trim(formData.get('screen_id'))
  const playlistId = trim(formData.get('playlist_id'))
  if (!screenId || !playlistId) return { error: 'Pick a playlist.' }
  const startsOn = trimOrNull(formData.get('starts_on'))
  const endsOn = trimOrNull(formData.get('ends_on'))
  const startTime = trimOrNull(formData.get('start_time'))
  const endTime = trimOrNull(formData.get('end_time'))
  const priority = intOrDefault(formData.get('priority'), 0)

  const admin = createAdminClient()
  // Sanity check screen + playlist are in the same org.
  const { data: screen } = await admin
    .from('signage_screens')
    .select('id, property_id')
    .eq('id', screenId)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!screen) return { error: 'Screen not found.' }
  const { data: playlist } = await admin
    .from('signage_playlists')
    .select('id, property_id')
    .eq('id', playlistId)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!playlist) return { error: 'Playlist not found.' }
  if (playlist.property_id !== screen.property_id) {
    return { error: 'Playlist belongs to a different property.' }
  }

  const { error } = await admin.from('signage_schedules').insert({
    screen_id: screenId,
    playlist_id: playlistId,
    org_id: session.organization.id,
    starts_on: startsOn,
    ends_on: endsOn,
    start_time: startTime,
    end_time: endTime,
    priority,
  })
  if (error) return { error: error.message }
  revalidatePath(`/signage/screens/${screenId}`)
  return { success: 'Schedule added.' }
}

export async function deleteScheduleAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  const screenId = trim(formData.get('screen_id'))
  const admin = createAdminClient()
  await admin
    .from('signage_schedules')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)
  if (screenId) revalidatePath(`/signage/screens/${screenId}`)
}

// ----------------------------------------------------------------------------
// Pair flow — the player sends a 6-digit code, we bind it to a screen.
// This runs from /display/pair so it's allowed without an org session.
// ----------------------------------------------------------------------------
export type PairResult =
  | { ok: true; token: string; screen: Pick<SignageScreen, 'id' | 'nickname'> }
  | { ok: false; error: string }

export async function pairByCodeAction(code: string): Promise<PairResult> {
  const cleaned = code.trim().replace(/\s+/g, '')
  if (!/^\d{6}$/.test(cleaned)) {
    return { ok: false, error: 'Enter the 6-digit code from your operator.' }
  }
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('signage_screens')
    .select('*')
    .eq('pairing_code', cleaned)
    .maybeSingle()
  if (!row) {
    return { ok: false, error: 'That code is not valid.' }
  }
  const screen = row as SignageScreen
  if (
    !screen.pairing_code_expires_at ||
    new Date(screen.pairing_code_expires_at) < new Date()
  ) {
    return { ok: false, error: 'That code has expired. Ask for a new one.' }
  }

  // Bind: clear the pairing code, record the user agent later via heartbeat.
  await admin
    .from('signage_screens')
    .update({
      pairing_code: null,
      pairing_code_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', screen.id)

  return {
    ok: true,
    token: screen.player_token,
    screen: { id: screen.id, nickname: screen.nickname },
  }
}
