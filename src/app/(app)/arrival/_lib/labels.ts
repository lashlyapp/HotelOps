import type { ArrivalSectionKind } from '@/lib/supabase/types'

export const SECTION_KIND_LABELS: Record<ArrivalSectionKind, string> = {
  info: 'Info cards',
  menu: 'Menu',
  event: 'Local events',
  marketing: 'Marketing',
}

export const SECTION_KIND_DESCRIPTION: Record<ArrivalSectionKind, string> = {
  info: 'Hours-and-photo cards (dining, gym, lobby, business center).',
  menu: 'Grouped food items with prices (restaurant, room service).',
  event: 'Things to do nearby — title, dates, blurb.',
  marketing: 'Promotional banners with a heading, subheading, and image.',
}

export const SECTION_KINDS: ArrivalSectionKind[] = [
  'info',
  'menu',
  'event',
  'marketing',
]

// Helper for inferring whether the body uses { items: ... } or { groups: ... }.
export function bodyShapeForKind(
  kind: ArrivalSectionKind,
): 'items' | 'groups' {
  return kind === 'menu' ? 'groups' : 'items'
}
