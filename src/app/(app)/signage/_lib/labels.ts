import type { SignageItemKind } from '@/lib/supabase/types'

export const ITEM_KIND_LABELS: Record<SignageItemKind, string> = {
  image: 'Image',
  video: 'Video',
  web: 'Web page',
  text: 'Text card',
}

export const ITEM_KINDS: SignageItemKind[] = ['image', 'video', 'web', 'text']

export const DEFAULT_DURATION_SECONDS: Record<SignageItemKind, number> = {
  image: 8,
  video: 30,
  web: 20,
  text: 8,
}

export const HEARTBEAT_ONLINE_WINDOW_MS = 90 * 1000

export function isScreenOnline(lastHeartbeatAt: string | null): boolean {
  if (!lastHeartbeatAt) return false
  const last = new Date(lastHeartbeatAt).getTime()
  if (!Number.isFinite(last)) return false
  return Date.now() - last < HEARTBEAT_ONLINE_WINDOW_MS
}
