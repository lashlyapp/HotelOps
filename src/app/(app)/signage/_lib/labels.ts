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

// Screens included in the base $100/property/mo plan. Beyond this
// requires the Signage Unlimited add-on (see docs/pricing.md).
export const SIGNAGE_BASE_SCREEN_LIMIT = 1

// Content kinds available on the base plan. Video and web pages are
// gated behind Signage Unlimited so the base "lobby TV" experience is
// genuinely basic (a logo + a welcome message) and operators with
// multimedia or web-driven content have an upgrade reason.
export const SIGNAGE_BASE_ITEM_KINDS = ['image', 'text'] as const

export function isBaseItemKind(kind: string): boolean {
  return (SIGNAGE_BASE_ITEM_KINDS as readonly string[]).includes(kind)
}

export function isScreenOnline(lastHeartbeatAt: string | null): boolean {
  if (!lastHeartbeatAt) return false
  const last = new Date(lastHeartbeatAt).getTime()
  if (!Number.isFinite(last)) return false
  return Date.now() - last < HEARTBEAT_ONLINE_WINDOW_MS
}
