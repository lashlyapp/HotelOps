import 'server-only'
import type { MediaFile } from '@/lib/r2/list'
import type { Event } from '@/lib/supabase/types'

// The eight rotating angles we cycle through. Each one knows:
//
//   - how to decide whether it can fire today (e.g. "today's event"
//     needs an actual event), and
//   - which media tag it would prefer when picking a photo from the
//     catalog (so a "catering feature" pulls food shots, not lobby).
//
// The rotation in `pickTopic` walks them in order, weighted away from
// anything posted in the last three days. If nothing qualifies (a
// property with no events / no media / no city) we fall back to
// 'local_moment', which works off the calendar alone.

export type TopicKey =
  | 'event_today'
  | 'staff_spotlight'
  | 'behind_the_scenes'
  | 'weather_mood'
  | 'local_moment'
  | 'sustainability'
  | 'guest_moment'
  | 'catering_feature'

export type Topic = {
  key: TopicKey
  label: string
  // Short blurb shown to the GM under the topic title.
  hint: string
  // Tags we'd prefer when picking a photo for this topic. First match
  // wins; if nothing tagged matches, the generator falls back to any
  // image, then to no image.
  preferredTags: string[]
}

export const TOPICS: Record<TopicKey, Topic> = {
  event_today: {
    key: 'event_today',
    label: "Today's event",
    hint: "Pulled from your Events module — there's a wedding, banquet, or catering happening today.",
    preferredTags: ['event', 'wedding', 'banquet', 'celebration', 'venue'],
  },
  staff_spotlight: {
    key: 'staff_spotlight',
    label: 'Staff spotlight',
    hint: 'Shout out the people behind the experience. Swap the placeholder name for a real team member.',
    preferredTags: ['team', 'staff', 'people', 'service'],
  },
  behind_the_scenes: {
    key: 'behind_the_scenes',
    label: 'Behind the scenes',
    hint: 'A peek at the craft — prep, plating, turn-down, floral. The kind of post followers save.',
    preferredTags: ['kitchen', 'prep', 'behind', 'detail', 'craft'],
  },
  weather_mood: {
    key: 'weather_mood',
    label: 'Weather + vibe',
    hint: "Today's weather paired with what the hotel feels like right now.",
    preferredTags: ['view', 'lobby', 'pool', 'fireplace', 'outdoor'],
  },
  local_moment: {
    key: 'local_moment',
    label: 'Local moment',
    hint: 'A nudge tied to the day of the week or the season. Always works, never feels forced.',
    preferredTags: ['neighborhood', 'local', 'town', 'view'],
  },
  sustainability: {
    key: 'sustainability',
    label: 'Sustainability moment',
    hint: 'One small thing you do that guests rarely notice — and why it matters.',
    preferredTags: ['garden', 'farm', 'sustainability', 'local', 'eco'],
  },
  guest_moment: {
    key: 'guest_moment',
    label: 'Guest moment',
    hint: 'A generic "thank-you to our guests" angle — easiest to personalize before posting.',
    preferredTags: ['guest', 'room', 'experience', 'welcome'],
  },
  catering_feature: {
    key: 'catering_feature',
    label: "Today's plate",
    hint: 'Lead with the food. Works for breakfast, lunch service, a tasting menu, or banquet prep.',
    preferredTags: ['food', 'plate', 'dining', 'menu', 'chef'],
  },
}

const ORDER: TopicKey[] = [
  'event_today', // highest priority IF an event exists today
  'weather_mood',
  'behind_the_scenes',
  'catering_feature',
  'staff_spotlight',
  'local_moment',
  'sustainability',
  'guest_moment',
]

export type PickInputs = {
  // YYYY-MM-DD in the property's local sense — we don't need timezone
  // precision; the rotation just needs to advance daily.
  today: string
  propertyId: string
  todaysEvents: Event[]
  recentMedia: MediaFile[]
  // Topics posted in the last three days, used to deprioritize repeats.
  recentTopics: TopicKey[]
}

/**
 * Pick today's topic. The rotation is deterministic by (date,
 * property) once we know the inputs — same day, same property, same
 * suggestion until the GM hits regenerate (which bumps the seed via
 * an attempt counter passed in `today`).
 */
export function pickTopic(inputs: PickInputs): Topic {
  // If there's an event today, lead with it. The rest of the rotation
  // only kicks in on quiet days.
  if (inputs.todaysEvents.length > 0) return TOPICS.event_today

  const recent = new Set(inputs.recentTopics)

  // Walk the ordered list, starting at a date-derived offset so we
  // don't pin every property to the same Sunday topic.
  const seed = hash(`${inputs.today}:${inputs.propertyId}`)
  const start = seed % ORDER.length

  // First pass: prefer topics NOT in the recent set.
  for (let i = 0; i < ORDER.length; i++) {
    const key = ORDER[(start + i) % ORDER.length]
    if (key === 'event_today') continue
    if (!recent.has(key)) return TOPICS[key]
  }
  // Everything's been used recently — fall back to whatever the seed lands on.
  const fallback = ORDER[(start + 1) % ORDER.length]
  return TOPICS[fallback === 'event_today' ? 'local_moment' : fallback]
}

/**
 * Pick the best media file for a given topic. Prefers tag matches in
 * the order listed; falls back to any image, then to null. Videos
 * aren't suggested — GMs would post stills, not reels, through the
 * download flow.
 */
export function pickMediaForTopic(
  topic: Topic,
  media: MediaFile[],
  seed: string,
): MediaFile | null {
  const images = media.filter((f) =>
    (f.contentType ?? '').startsWith('image/'),
  )
  if (images.length === 0) return null

  for (const tag of topic.preferredTags) {
    const matching = images.filter((f) =>
      f.tags.some((t) => t.toLowerCase().includes(tag)),
    )
    if (matching.length > 0) {
      // Deterministic pick within the matching set so the same day
      // doesn't shuffle the suggestion on every render.
      return matching[hash(seed) % matching.length]
    }
  }

  // No tag match — pick any image deterministically.
  return images[hash(seed) % images.length]
}

// FNV-1a, 32-bit — small, dependency-free, fine for "spread a string
// across a small bucket count".
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h
}
