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
  // Property-anchored — real hotel content, lean on the catalog.
  | 'event_today'
  | 'staff_spotlight'
  | 'behind_the_scenes'
  | 'catering_feature'
  | 'room_reveal'
  | 'amenity_spotlight'
  | 'bar_cocktail'
  | 'morning_routine'
  | 'evening_ritual'
  | 'wellness'
  | 'sustainability'
  | 'guest_moment'
  | 'seasonal_decor'
  // Destination-anchored — travel-vibe angles, lean on Unsplash.
  | 'weather_mood'
  | 'local_moment'
  | 'nearby_landmarks'
  | 'local_attractions'
  | 'local_cuisine'
  | 'transit_arrival'
  | 'nature_nearby'
  | 'culture_arts'

// How aggressively the topic leans on outside imagery (Unsplash).
//
//   external_only:  always try Unsplash. Catalog is a last resort if
//                   the upstream call fails. Use for topics where the
//                   GM is talking about places they don't photograph
//                   themselves (landmarks).
//
//   external_first: try Unsplash first; fall back to catalog when
//                   Unsplash returns nothing or the key is unset.
//                   Use for travel-vibe topics where stock photography
//                   often beats whatever's in the catalog (local
//                   moments, weather mood).
//
//   catalog_first:  try the catalog first; fall back to Unsplash on
//                   the every-Nth-post cadence so a thin catalog
//                   doesn't recycle the same images. Default for most
//                   operational topics.
//
//   catalog_only:   never substitute. The post is about a real event
//                   or specific people; a stock photo would feel
//                   dishonest. If the catalog has no fitting image,
//                   the post ships without one.
export type TopicMediaPolicy =
  | 'external_only'
  | 'external_first'
  | 'catalog_first'
  | 'catalog_only'

export type Topic = {
  key: TopicKey
  label: string
  // Short blurb shown to the GM under the topic title.
  hint: string
  // Tags we'd prefer when picking a photo for this topic. First match
  // wins; if nothing tagged matches, the generator falls back to any
  // image, then to no image.
  preferredTags: string[]
  mediaPolicy: TopicMediaPolicy
}

export const TOPICS: Record<TopicKey, Topic> = {
  event_today: {
    key: 'event_today',
    label: "Today's event",
    hint: "Pulled from your Events module — there's a wedding, banquet, or catering happening today.",
    preferredTags: ['event', 'wedding', 'banquet', 'celebration', 'venue'],
    // Real event photos only — a stock wedding shot here would feel dishonest.
    mediaPolicy: 'catalog_only',
  },
  staff_spotlight: {
    key: 'staff_spotlight',
    label: 'Staff spotlight',
    hint: 'Shout out the people behind the experience. Swap the placeholder name for a real team member.',
    preferredTags: ['team', 'staff', 'people', 'service'],
    // Has to be the actual team. Stock photography of "hospitality
    // workers" would directly contradict the post copy.
    mediaPolicy: 'catalog_only',
  },
  behind_the_scenes: {
    key: 'behind_the_scenes',
    label: 'Behind the scenes',
    hint: 'A peek at the craft — prep, plating, turn-down, floral. The kind of post followers save.',
    preferredTags: ['kitchen', 'prep', 'behind', 'detail', 'craft'],
    mediaPolicy: 'catalog_first',
  },
  weather_mood: {
    key: 'weather_mood',
    label: 'Weather + vibe',
    hint: "Today's weather paired with what the hotel feels like right now. Often pulls a travel-style Unsplash shot since most catalogs don't have a fitting rainy-day photo.",
    preferredTags: ['view', 'lobby', 'pool', 'fireplace', 'outdoor'],
    // Weather-matched stock often reads better than a sunny lobby
    // photo on a rainy day. Property catalogs rarely cover every mood.
    mediaPolicy: 'external_first',
  },
  local_moment: {
    key: 'local_moment',
    label: 'Local moment',
    hint: 'A nudge tied to the day of the week or the season — often paired with a city / neighborhood photo from Unsplash to bring the destination into the post.',
    preferredTags: ['neighborhood', 'local', 'town', 'view'],
    // Street and town shots from the property's own catalog are rare;
    // Unsplash usually has stronger destination photography.
    mediaPolicy: 'external_first',
  },
  sustainability: {
    key: 'sustainability',
    label: 'Sustainability moment',
    hint: 'One small thing you do that guests rarely notice — and why it matters.',
    preferredTags: ['garden', 'farm', 'sustainability', 'local', 'eco'],
    mediaPolicy: 'catalog_first',
  },
  guest_moment: {
    key: 'guest_moment',
    label: 'Guest moment',
    hint: 'A generic "thank-you to our guests" angle, sometimes paired with a travel-vibe Unsplash photo (airport, road trip, sunrise) to widen the visual range.',
    preferredTags: ['guest', 'room', 'experience', 'welcome'],
    // Mostly catalog (real welcome / room moments), occasionally
    // bumped to a travel-vibe stock image via the cadence rule.
    mediaPolicy: 'catalog_first',
  },
  catering_feature: {
    key: 'catering_feature',
    label: "Today's plate",
    hint: 'Lead with the food. Works for breakfast, lunch service, a tasting menu, or banquet prep.',
    preferredTags: ['food', 'plate', 'dining', 'menu', 'chef'],
    mediaPolicy: 'catalog_first',
  },
  room_reveal: {
    key: 'room_reveal',
    label: 'Room reveal',
    hint: 'Hero a beautifully made room. The single most-saved post category for hotels — guests imagine themselves in the frame.',
    preferredTags: ['room', 'suite', 'bedroom', 'interior'],
    mediaPolicy: 'catalog_first',
  },
  amenity_spotlight: {
    key: 'amenity_spotlight',
    label: 'Amenity spotlight',
    hint: 'Pool, spa, terrace, library, fireplace — the spaces guests come back for. Pair with a photo that shows it empty and beautiful.',
    preferredTags: ['pool', 'spa', 'terrace', 'lounge', 'fireplace', 'amenity', 'library', 'gym'],
    mediaPolicy: 'catalog_first',
  },
  bar_cocktail: {
    key: 'bar_cocktail',
    label: 'Bar & cocktails',
    hint: 'Lead with a signature drink. Strong saturation and shallow depth-of-field bar shots over-index on Instagram.',
    preferredTags: ['bar', 'cocktail', 'drink', 'wine', 'lounge'],
    mediaPolicy: 'catalog_first',
  },
  morning_routine: {
    key: 'morning_routine',
    label: 'Morning routine',
    hint: 'Coffee, breakfast spread, sunrise on the terrace. The "good morning" post — easy save, easy share.',
    preferredTags: ['coffee', 'breakfast', 'morning', 'sunrise', 'pastry'],
    mediaPolicy: 'catalog_first',
  },
  evening_ritual: {
    key: 'evening_ritual',
    label: 'Evening ritual',
    hint: 'Sunset, turn-down, candlelight, that-second-glass moments. Posts well around 5–7pm local.',
    preferredTags: ['sunset', 'evening', 'candle', 'turndown', 'night'],
    mediaPolicy: 'catalog_first',
  },
  wellness: {
    key: 'wellness',
    label: 'Wellness',
    hint: 'Spa, yoga, gym, sauna, cold plunge — anything restorative. Strong fit for January and post-holiday seasons.',
    preferredTags: ['spa', 'wellness', 'yoga', 'gym', 'sauna', 'massage'],
    mediaPolicy: 'catalog_first',
  },
  seasonal_decor: {
    key: 'seasonal_decor',
    label: 'Seasonal moment',
    hint: 'Holiday lights, fall foliage on the porch, summer pool floats, spring blossoms. Tie the property to the calendar.',
    preferredTags: ['seasonal', 'holiday', 'autumn', 'spring', 'summer', 'winter', 'decor'],
    mediaPolicy: 'catalog_first',
  },
  nearby_landmarks: {
    key: 'nearby_landmarks',
    label: 'Nearby landmarks',
    hint: 'A travel-style nod to what guests can walk to. Image is sourced from Unsplash so you can post about places you don\'t have photos of.',
    // Unused — this topic always pulls from Unsplash, not the catalog.
    preferredTags: [],
    mediaPolicy: 'external_only',
  },
  local_attractions: {
    key: 'local_attractions',
    label: 'Local attractions',
    hint: 'Things to do near the property — aquarium, zoo, theme park, kid-friendly outings, day trips. One of the biggest reasons people book in the first place, so position the hotel as a base camp.',
    preferredTags: ['attraction', 'family', 'kids', 'tour'],
    // Catalog rarely covers attractions; Unsplash does it well across
    // every category. Falls back to catalog if the GM happens to have
    // a partner-attraction photo on file.
    mediaPolicy: 'external_first',
  },
  local_cuisine: {
    key: 'local_cuisine',
    label: 'Local cuisine',
    hint: 'A "what to eat nearby" angle — the regional dish, the bakery on the corner, the market. Strong destination signal for in-feed travelers.',
    preferredTags: ['food', 'local', 'market'],
    // City-specific food photography rarely lives in a hotel's own
    // catalog; Unsplash has thousands of beautiful local-cuisine shots.
    mediaPolicy: 'external_first',
  },
  transit_arrival: {
    key: 'transit_arrival',
    label: 'Welcome travelers',
    hint: 'Airport, train station, road-trip-arriving vibes. The "we\'ll be here when you land" angle — performs well as a Sunday-evening post.',
    preferredTags: ['arrival', 'welcome'],
    mediaPolicy: 'external_first',
  },
  nature_nearby: {
    key: 'nature_nearby',
    label: 'Nature nearby',
    hint: 'Beach, mountains, forest, vineyards, parks — the outdoors within reach of the property. Catalogs rarely cover this; Unsplash does it well.',
    preferredTags: ['nature', 'outdoor', 'view', 'mountain', 'beach', 'forest'],
    mediaPolicy: 'external_first',
  },
  culture_arts: {
    key: 'culture_arts',
    label: 'Culture & arts',
    hint: 'Museums, galleries, theaters, street murals — the things travelers came here to see. Positions the hotel as a base for culture, not just a place to sleep.',
    preferredTags: ['art', 'museum', 'culture'],
    mediaPolicy: 'external_first',
  },
}

// Rotation order. The picker starts at a date-derived offset and walks
// from there, biased away from anything posted in the last few days,
// so the literal order matters less than the breadth — what we want is
// for every property's two-week stretch of posts to feel varied. The
// list deliberately interleaves property-anchored and destination-
// anchored topics so the feed alternates "look at us" with "look at
// where we are."
const ORDER: TopicKey[] = [
  'event_today', // highest priority IF an event exists today
  'morning_routine',
  'weather_mood',
  'room_reveal',
  'local_cuisine',
  'behind_the_scenes',
  'amenity_spotlight',
  'nature_nearby',
  'catering_feature',
  'evening_ritual',
  'culture_arts',
  'bar_cocktail',
  'staff_spotlight',
  'local_moment',
  'wellness',
  'transit_arrival',
  'sustainability',
  'seasonal_decor',
  'guest_moment',
  'local_attractions',
  'nearby_landmarks',
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

/**
 * Build an Unsplash search query for a given topic + property. Returns
 * null when we don't have a sensible query to make (e.g. landmarks
 * topic but no city on the property). The cron skips Unsplash and
 * falls back to the catalog in that case.
 *
 * Query design: most topics get a generic travel/hotel-vibe query so
 * the photo widens the GM's catalog (airports, terraces, destinations,
 * etc). The two exceptions are 'local_moment' and 'nearby_landmarks',
 * which inject the property's city — those posts are the ones that
 * benefit most from real local photography the hotel doesn't own.
 */
export function buildUnsplashQuery(
  topic: Topic,
  property: { city: string | null; country: string },
  weather: { condition: string | null },
): string | null {
  const city = property.city?.trim() ?? ''

  switch (topic.key) {
    case 'nearby_landmarks':
      // Pure location query. Falls through to country if the property
      // has no city set — still gives us a destination photo, just
      // less specific. Skip entirely if we have neither.
      if (city) return `${city} landmark`
      if (property.country) return `${property.country} landmark`
      return null

    case 'local_moment':
      if (city) return `${city} travel`
      return 'travel destination'

    case 'weather_mood':
      switch (weather.condition) {
        case 'sunny':
          return 'sunny hotel terrace'
        case 'rainy':
          return 'rainy hotel window'
        case 'snowy':
          return 'snowy hotel exterior'
        case 'foggy':
          return 'foggy morning hotel'
        case 'cloudy':
          return 'overcast hotel lobby'
        default:
          return 'hotel lobby morning'
      }

    case 'catering_feature':
      return 'hotel restaurant plating'

    case 'behind_the_scenes':
      return 'hotel kitchen craft'

    case 'staff_spotlight':
      return 'hotel hospitality team'

    case 'sustainability':
      return 'sustainable hotel garden'

    case 'guest_moment':
      return 'travel airport sunrise'

    case 'room_reveal':
      return 'boutique hotel room interior'

    case 'amenity_spotlight':
      return 'hotel pool spa terrace'

    case 'bar_cocktail':
      return 'hotel bar cocktail moody'

    case 'morning_routine':
      return 'hotel breakfast coffee morning'

    case 'evening_ritual':
      return 'hotel sunset terrace candlelight'

    case 'wellness':
      return 'hotel spa wellness sauna'

    case 'seasonal_decor':
      return 'hotel seasonal decor'

    case 'local_cuisine':
      if (city) return `${city} food`
      return 'local cuisine market'

    case 'transit_arrival':
      return 'airport arrival travel'

    case 'nature_nearby':
      if (city) return `${city} nature outdoors`
      return 'travel nature destination'

    case 'culture_arts':
      if (city) return `${city} museum art`
      return 'travel museum gallery'

    case 'local_attractions':
      // Stay broad — the Unsplash query language for "attractions" is
      // weak compared to specific terms. Bias toward "things to do"
      // / day-trip imagery rather than monolithic landmarks.
      if (city) return `${city} things to do`
      return 'family travel attractions'

    case 'event_today':
    case 'staff_spotlight':
      // Don't substitute — these need authentic property content.
      // (staff_spotlight is catalog_only, so this only matters when
      // a future caller asks for a query anyway.)
      return null
  }
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
