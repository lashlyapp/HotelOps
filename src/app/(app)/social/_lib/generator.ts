import 'server-only'
import type { MediaFile } from '@/lib/r2/list'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  BrandVoice,
  Event,
  Property,
  PropertySocialSettings,
  SocialCaptionFeedback,
  SocialPostLog,
} from '@/lib/supabase/types'
import { listMediaWithTags } from '@/lib/r2/list'
import { generateCaptions, type ChatMessage } from './openai'
import {
  buildUnsplashQuery,
  pickMediaForTopic,
  pickTopic,
  type Topic,
  type TopicKey,
  TOPICS,
} from './topics'
import {
  pickUnsplashPhoto,
  type UnsplashPhoto,
} from './unsplash'
import { getWeatherForProperty, type WeatherSummary } from './weather'

export type GeneratedMedia =
  | { source: 'catalog'; file: MediaFile }
  | { source: 'unsplash'; photo: UnsplashPhoto }

export type GeneratedPost = {
  topic: Topic
  captions: string[]
  // Parallel to `captions`. AI-suggested hashtags per variant — the
  // GM-configured signature hashtags are NOT included here (they're
  // appended at copy/email time by the UI / actions).
  hashtagSets: string[][]
  // null when nothing matched — the GM gets a caption-only suggestion.
  media: GeneratedMedia | null
  weather: WeatherSummary
  // True when the captions came from OpenAI; false when we fell back to
  // templates (no key, bad key, network error). The UI surfaces this
  // so the GM knows whether to expect more variety after configuring
  // their key.
  usedAi: boolean
  // Null when no settings row exists yet for this property.
  settings: PropertySocialSettings | null
}

export type GenerateInput = {
  property: Property
  orgName: string
  // Date string YYYY-MM-DD. The cron passes today's UTC date; topic
  // rotation is keyed on this so a same-day retry produces an
  // identical pick (idempotent under the unique constraint on
  // (property_id, post_date)).
  today: string
}

/**
 * Build today's post: pick a topic, find a photo, call OpenAI (or fall
 * back to a template), and return the bundle the cron persists to
 * `social_post_log`. The `/social` page reads that row, it does NOT
 * call this function — generation is system-driven, once per day.
 */
export async function generatePost(input: GenerateInput): Promise<GeneratedPost> {
  const admin = createAdminClient()

  // Gather everything in parallel.
  const [
    { data: settings },
    { data: recentLog },
    { data: events },
    { data: feedback },
    media,
    weather,
  ] = await Promise.all([
    admin
      .from('property_social_settings')
      .select('*')
      .eq('property_id', input.property.id)
      .maybeSingle(),
    // Pull the last few posts for two reasons:
    //   1. topic rotation (avoid repeating yesterday's angle)
    //   2. "every fifth post uses Unsplash" — see decideMediaSource
    admin
      .from('social_post_log')
      .select('topic, external_media_url, created_at')
      .eq('property_id', input.property.id)
      .order('created_at', { ascending: false })
      .limit(5),
    admin
      .from('events')
      .select('*')
      .eq('property_id', input.property.id)
      .gte('starts_at', `${input.today}T00:00:00Z`)
      .lte('starts_at', `${input.today}T23:59:59Z`)
      .in('status', ['definite', 'in_progress', 'completed']),
    // Pull a window of recent thumbs votes — the generator splices a
    // few of each polarity into the prompt as preference signals.
    admin
      .from('social_caption_feedback')
      .select('caption, topic, liked')
      .eq('property_id', input.property.id)
      .order('updated_at', { ascending: false })
      .limit(30),
    listMediaWithTags(input.property.id, input.property.r2_prefix),
    getWeatherForProperty(input.property.city, input.property.country),
  ])

  const typedSettings = (settings as PropertySocialSettings | null) ?? null
  const recentTopics = ((recentLog ?? []) as Pick<SocialPostLog, 'topic'>[])
    .map((r) => r.topic as TopicKey)
    .filter((t): t is TopicKey => t in TOPICS)

  const topic = pickTopic({
    today: input.today,
    propertyId: input.property.id,
    todaysEvents: (events as Event[]) ?? [],
    recentMedia: media,
    recentTopics,
  })

  const seed = `${input.today}#${input.property.id}`
  const recentRows = (recentLog ?? []) as Array<
    Pick<SocialPostLog, 'topic' | 'external_media_url' | 'created_at'>
  >
  const photo = await pickPhoto({
    topic,
    property: input.property,
    weather,
    catalog: media,
    seed,
    recent: recentRows,
  })

  const voice = (typedSettings?.brand_voice ?? 'warm') as BrandVoice
  const hashtags = typedSettings?.signature_hashtags?.trim() ?? ''
  const handles = typedSettings?.social_handles?.trim() ?? ''

  const todaysEvent = ((events as Event[]) ?? [])[0] ?? null

  const feedbackRows =
    (feedback as Pick<SocialCaptionFeedback, 'caption' | 'topic' | 'liked'>[]) ??
    []

  let captions: string[] = []
  let hashtagSets: string[][] = []
  let usedAi = false
  const apiKey = process.env.OPENAI_API_KEY?.trim() || null
  if (apiKey) {
    try {
      const messages = buildPrompt({
        topic,
        voice,
        property: input.property,
        orgName: input.orgName,
        today: input.today,
        weather,
        event: todaysEvent,
        photo,
        hashtags,
        handles,
        feedback: feedbackRows,
      })
      const aiResult = await generateCaptions(apiKey, messages)
      if (aiResult.captions.length > 0) {
        captions = aiResult.captions
        hashtagSets = padHashtagSets(aiResult.hashtagSets, captions.length)
        usedAi = true
      }
    } catch (err) {
      console.warn('[social] OpenAI generation failed, using fallback', err)
    }
  }

  if (captions.length === 0) {
    const fallback = fallbackCaptions({
      topic,
      voice,
      property: input.property,
      weather,
      event: todaysEvent,
      hashtags,
      handles,
    })
    captions = fallback.captions
    hashtagSets = fallback.hashtagSets
  }

  return {
    topic,
    captions,
    hashtagSets,
    media: photo,
    weather,
    usedAi,
    settings: typedSettings,
  }
}

function padHashtagSets(sets: string[][], length: number): string[][] {
  const out: string[][] = []
  for (let i = 0; i < length; i++) {
    out.push(Array.isArray(sets[i]) ? sets[i] : [])
  }
  return out
}

// ---------------------------------------------------------------------------
// Photo source decision
// ---------------------------------------------------------------------------

/**
 * Pick the photo for today's post. Drives off `topic.mediaPolicy`:
 *
 *   external_only   — always try Unsplash. Used for topics like
 *                     "nearby landmarks" where the catalog can't
 *                     reasonably cover the angle.
 *
 *   external_first  — Unsplash first, catalog fallback. Used for
 *                     travel-style topics (local moments, weather
 *                     vibes) where stock photography typically beats
 *                     whatever's in the catalog. The bulk of "more
 *                     topics use Unsplash" lives here.
 *
 *   catalog_first   — catalog first, Unsplash fallback only when the
 *                     5th-post cadence hits or the catalog is empty
 *                     for this topic.
 *
 *   catalog_only    — never substitute. Real events, real staff.
 *
 * Any Unsplash failure (no key, no results, network blip) cleanly
 * falls through to the catalog, then to no image at all.
 */
async function pickPhoto(args: {
  topic: Topic
  property: Property
  weather: WeatherSummary
  catalog: MediaFile[]
  seed: string
  recent: Array<Pick<SocialPostLog, 'topic' | 'external_media_url' | 'created_at'>>
}): Promise<GeneratedMedia | null> {
  const tryUnsplash = async (): Promise<GeneratedMedia | null> => {
    const query = buildUnsplashQuery(args.topic, args.property, args.weather)
    if (!query) return null
    const photo = await pickUnsplashPhoto({ query, seed: args.seed })
    if (!photo) return null
    return { source: 'unsplash', photo }
  }
  const pickCatalog = (): GeneratedMedia | null => {
    const file = pickMediaForTopic(args.topic, args.catalog, args.seed)
    return file ? { source: 'catalog', file } : null
  }

  switch (args.topic.mediaPolicy) {
    case 'external_only':
      return (await tryUnsplash()) ?? pickCatalog()

    case 'external_first':
      return (await tryUnsplash()) ?? pickCatalog()

    case 'catalog_first': {
      // Cadence: if the last few posts all came from the catalog,
      // bump this one to Unsplash. Keeps a thin catalog from cycling
      // the same ten images day after day.
      if (shouldUseUnsplashByCadence(args.recent)) {
        return (await tryUnsplash()) ?? pickCatalog()
      }
      // Otherwise catalog-first, with Unsplash as a last-resort
      // fallback when the catalog has nothing fitting (small media
      // library, brand-new property).
      return pickCatalog() ?? (await tryUnsplash())
    }

    case 'catalog_only':
      return pickCatalog()
  }
}

const UNSPLASH_CADENCE = 5

function shouldUseUnsplashByCadence(
  recent: Array<Pick<SocialPostLog, 'external_media_url'>>,
): boolean {
  // Count how many of the last (CADENCE - 1) posts came from the
  // catalog. If they all did, this one goes Unsplash. Less arithmetic
  // than tracking an integer counter and naturally resyncs if a row
  // ever gets deleted.
  const window = recent.slice(0, UNSPLASH_CADENCE - 1)
  if (window.length < UNSPLASH_CADENCE - 1) return false
  return window.every((r) => !r.external_media_url)
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

type PromptInput = {
  topic: Topic
  voice: BrandVoice
  property: Property
  orgName: string
  today: string
  weather: WeatherSummary
  event: Event | null
  photo: GeneratedMedia | null
  hashtags: string
  handles: string
  // Recent thumbs votes — fed into the prompt as positive / negative
  // few-shot examples so the model picks up the property's taste.
  feedback: Pick<SocialCaptionFeedback, 'caption' | 'topic' | 'liked'>[]
}

const VOICE_DESCRIPTIONS: Record<BrandVoice, string> = {
  warm: 'warm, sincere, conversational — like a host welcoming a friend',
  luxury:
    'elevated, restrained, confident — never showy, every word chosen carefully',
  boutique:
    'curated, distinctive, a little witty — like an independent shop with strong taste',
  family:
    'friendly, inclusive, easy — like a place that knows kids and grandparents both',
  casual:
    'relaxed, plainspoken, no jargon — like a neighbor texting their favorite spot',
  playful:
    'cheeky, light, a wink — emoji-friendly but never cringe',
}

function buildPrompt(p: PromptInput): ChatMessage[] {
  const system = [
    `You write social-media captions for an independent hotel. Voice: ${VOICE_DESCRIPTIONS[p.voice]}.`,
    `Hard rules:`,
    `- Return JSON: { "variants": [ { "caption": "...", "hashtags": ["#one", "#two"] }, ... ] } — exactly three distinct variants.`,
    `- Each caption is 1 to 3 short sentences, Instagram-friendly. No hashtags inside the body of the caption itself.`,
    `- Each variant's hashtags array has 3 to 6 relevant tags: location, hotel type, the day's theme, food/decor if relevant. Lowercase, no spaces. Avoid generic spam like #love, #instagood, #photooftheday.`,
    `- Do not invent specifics (named dishes, named staff, prices, awards). If you need a placeholder, use [in brackets] so the GM knows to replace it.`,
    `- Never use the word "nestled". Avoid clichés like "hidden gem" and "your home away from home".`,
    `- Do not use first-person plural ("we", "our") more than twice per caption.`,
  ].join('\n')

  const lines: string[] = []
  lines.push(`Hotel: ${p.property.name} (part of ${p.orgName}).`)
  if (p.property.city) {
    lines.push(`Location: ${p.property.city}${p.property.state ? `, ${p.property.state}` : ''}.`)
  }
  if (p.property.description) {
    lines.push(`What the hotel is like: ${p.property.description}`)
  }
  if (p.handles) lines.push(`Hotel handle to mention if natural: ${p.handles}.`)
  lines.push('')
  lines.push(`Today is ${p.today}.`)
  if (p.weather.phrase) {
    lines.push(`Local weather today: ${p.weather.phrase}.`)
  }
  lines.push('')
  lines.push(`Today's angle: ${p.topic.label}. ${p.topic.hint}`)

  if (p.event && p.topic.key === 'event_today') {
    lines.push(
      `Event happening: ${p.event.event_type} called "${p.event.name}"${p.event.guests_expected ? `, ~${p.event.guests_expected} guests` : ''}. Reference it warmly without giving away private guest details.`,
    )
  }

  if (p.photo) {
    if (p.photo.source === 'catalog') {
      const f = p.photo.file
      const desc = f.description?.trim()
      const tags = f.tags.join(', ')
      lines.push(
        `The post will pair with a photo from the hotel's own catalog: ${f.displayName}${desc ? ` — ${desc}` : ''}${tags ? ` (tags: ${tags})` : ''}. Write captions that complement what's likely in the frame.`,
      )
    } else {
      const alt = p.photo.photo.altDescription?.trim()
      lines.push(
        `The post will pair with a stock photo${alt ? ` showing ${alt}` : ''} sourced from Unsplash. The captions should evoke the destination / travel feeling, not claim it as a photo of the hotel itself.`,
      )
    }
  }

  if (p.hashtags) {
    lines.push(
      `IMPORTANT: do not include hashtags in the body of any caption. The app appends "${p.hashtags}" automatically.`,
    )
  }

  // Bias toward what's worked, away from what hasn't. We prefer
  // same-topic examples first (most relevant), then fall back to
  // cross-topic ones so a new topic still gets some signal.
  const liked = pickExamples(p.feedback, p.topic.key, true, 4)
  const disliked = pickExamples(p.feedback, p.topic.key, false, 4)

  if (liked.length > 0 || disliked.length > 0) {
    lines.push('')
    lines.push(
      `The hotel's social manager has been rating past captions. Match the spirit of the ones they liked; avoid the patterns of the ones they didn't.`,
    )
    if (liked.length > 0) {
      lines.push('Captions they LIKED:')
      for (const c of liked) lines.push(`  + ${c}`)
    }
    if (disliked.length > 0) {
      lines.push('Captions they DISLIKED:')
      for (const c of disliked) lines.push(`  - ${c}`)
    }
  }

  lines.push('')
  lines.push(`Return three captions of varying length: one short (under 80 chars), one medium (~150 chars), one longer (2-3 sentences).`)

  return [
    { role: 'system', content: system },
    { role: 'user', content: lines.join('\n') },
  ]
}

function pickExamples(
  feedback: Pick<SocialCaptionFeedback, 'caption' | 'topic' | 'liked'>[],
  topicKey: string,
  liked: boolean,
  max: number,
): string[] {
  const matching = feedback.filter((f) => f.liked === liked)
  const sameTopic = matching.filter((f) => f.topic === topicKey)
  const other = matching.filter((f) => f.topic !== topicKey)
  // De-dupe by caption text — a GM might have flipped their vote
  // multiple times on the same caption; we already upsert at the DB
  // layer but this is cheap defense.
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of [...sameTopic, ...other]) {
    if (seen.has(row.caption)) continue
    seen.add(row.caption)
    out.push(row.caption)
    if (out.length >= max) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Fallback templates (no API key, or call failed)
// ---------------------------------------------------------------------------

function fallbackCaptions(p: {
  topic: Topic
  voice: BrandVoice
  property: Property
  weather: WeatherSummary
  event: Event | null
  hashtags: string
  handles: string
}): { captions: string[]; hashtagSets: string[][] } {
  const name = p.property.name
  const city = p.property.city ?? ''
  const weather = p.weather.phrase
  const ev = p.event

  const localTag = city
    ? `#${city.toLowerCase().replace(/\s+/g, '')}`
    : null
  const hotelTag = `#${name.toLowerCase().replace(/\s+/g, '')}`
  const base: string[] = ['#boutiquehotel', '#hotellife']
  if (localTag) base.unshift(localTag)
  base.unshift(hotelTag)

  // Per-topic enrichment over the base set.
  const topical: string[] = (() => {
    switch (p.topic.key) {
      case 'event_today':
        return ['#weddingvenue', '#eventspace', '#celebrate']
      case 'staff_spotlight':
        return ['#hotelteam', '#hospitality', '#peoplefirst']
      case 'behind_the_scenes':
        return ['#behindthescenes', '#craft', '#hospitality']
      case 'weather_mood':
        return p.weather.condition === 'sunny'
          ? ['#sunnyday', '#travelvibes']
          : p.weather.condition === 'rainy'
            ? ['#rainyday', '#cozyvibes']
            : p.weather.condition === 'snowy'
              ? ['#winterstay', '#snowday']
              : ['#travelvibes', '#staycation']
      case 'local_moment':
        return ['#explorelocal', '#travel']
      case 'sustainability':
        return ['#sustainabletravel', '#smallchoices', '#localfirst']
      case 'guest_moment':
        return ['#thankyou', '#guestlove', '#hospitality']
      case 'catering_feature':
        return ['#hotelrestaurant', '#chefspecial', '#foodie']
      case 'nearby_landmarks':
        return ['#travel', '#explorelocal', '#destination']
    }
  })()

  // De-dupe, keep order.
  const seen = new Set<string>()
  const merged: string[] = []
  for (const tag of [...base, ...topical]) {
    const k = tag.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(tag)
    if (merged.length >= 5) break
  }
  const hashtags = merged

  const captions: string[] = (() => {
    switch (p.topic.key) {
      case 'event_today':
        return [
          `Setting up for ${ev?.name ?? 'something special'} today.`,
          `Today's a good one at ${name} — ${ev?.event_type ?? 'an event'} in the house.`,
          `[Add a detail or two] — ${ev?.name ?? "today's event"} is on, and the team is ready.`,
        ]
      case 'staff_spotlight':
        return [
          `Shoutout to [team member's name].`,
          `Behind every smooth stay: the people. Today's spotlight — [name], [role].`,
          `Meet [name]. [One line about what they do that guests love]. Grateful to have them on the ${name} team.`,
        ]
      case 'behind_the_scenes':
        return [
          `A small thing, done well.`,
          `Some of the best moments at ${name} happen before the doors open.`,
          `Quiet work behind the scenes — the kind of thing you only notice when it isn't there. [Add one specific detail].`,
        ]
      case 'weather_mood':
        return [
          weather ? `${capitalize(weather)} in ${city || 'town'} today.` : `Quiet morning at ${name}.`,
          weather ? `${capitalize(weather)} kind of day — [add what that means for the hotel today].` : `Today feels like a [add one word] kind of day.`,
          weather
            ? `${capitalize(weather)} outside, ${moodForWeather(p.weather.condition)} inside. Drop by.`
            : `Pull up a chair at ${name}. [Add one detail about the view, light, or sound right now].`,
        ]
      case 'local_moment':
        return [
          city ? `A small love letter to ${city}.` : `Some days you just slow down.`,
          `[Add a local recommendation — a coffee spot, a walk, a market]. Easy day, well spent.`,
          `Living locally for a day or two: that's the ${name} promise. [Add what's on this week].`,
        ]
      case 'sustainability':
        return [
          `Small choices add up.`,
          `At ${name}, [add one quiet sustainability practice]. Not a campaign — just how we run.`,
          `[Add one specific sustainable choice you make]. We don't talk about it much, but it matters to us.`,
        ]
      case 'guest_moment':
        return [
          `Thank you for the trip.`,
          `Quiet thanks to everyone who chose ${name} this week. We loved having you.`,
          `Some of the best parts of our day are the conversations at the front desk. Thank you for being kind to our team. — the crew at ${name}.`,
        ]
      case 'catering_feature':
        return [
          `On the plate today: [add the dish].`,
          `Today's kitchen, today's plate — [add a one-line description].`,
          `Made for ${name} by [add the chef's first name]: [add the dish or course]. Stop in.`,
        ]
      case 'nearby_landmarks':
        return [
          city ? `${city}, on your doorstep.` : `Local landmarks, within walking distance.`,
          city
            ? `Steps from ${name}: [add a landmark guests can walk to]. The kind of detail that makes a trip.`
            : `Step outside and you're already there. [Add a landmark or two within walking distance].`,
          `Stay at ${name} and see [add a landmark] without ever booking a cab. The neighborhood is the amenity.`,
        ]
    }
  })()

  return {
    captions,
    hashtagSets: captions.map(() => hashtags),
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function moodForWeather(c: WeatherSummary['condition']): string {
  switch (c) {
    case 'rainy':
      return 'firelight and a good book'
    case 'snowy':
      return 'wool blankets and hot coffee'
    case 'cloudy':
      return 'long lunches and quiet rooms'
    case 'foggy':
      return 'candles already lit'
    case 'sunny':
      return 'sun on the terrace'
    default:
      return 'the calm you came for'
  }
}

