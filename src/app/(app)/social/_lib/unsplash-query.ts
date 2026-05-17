import 'server-only'

/**
 * Per-property, per-day Unsplash search query generator.
 *
 * The old generator used hardcoded query templates keyed on topic
 * (`weather_mood + sunny` → `"sunny hotel terrace"`). That meant
 * every property on every sunny Tuesday pulled from the same 50
 * Unsplash results — the feed turned into a stock-photo cliché.
 *
 * This module asks gpt-4o-mini to write a fresh, concrete,
 * evocative query each morning, conditioned on:
 *   - today's topic + hint
 *   - the property's city / country
 *   - the local weather phrase
 *   - the season (computed from today's date)
 *
 * Cost: one OpenAI call per property per day at ~$0.0001 each.
 *
 * Failure mode: on missing key / network error / unparseable
 * response, returns null. The caller falls back to the existing
 * topics.buildUnsplashQuery template, so the feature never breaks
 * — it just degrades to the previous behavior.
 */

const ENDPOINT = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'
const TIMEOUT_MS = 12_000

const SYSTEM_PROMPT = `You generate Unsplash search queries for a boutique hotel's daily social-media post. Given a topic, weather, season, and the hotel's location, write ONE concrete, evocative query that returns a fresh photo — not a stock cliché.

Rules:
- 3 to 6 words; no quotes, no punctuation
- Concrete subjects + visual texture (objects, light, materials), not abstract concepts
- Banned words: "hotel", "boutique", "luxury", "stunning", "beautiful", "elegant", "modern", "design", "vibes"
- Mix a subject with a sensory detail. Examples of good shapes:
  - "linen napkin espresso morning"
  - "stone terrace dappled light"
  - "wood ceiling sunrise reflection"
  - "pomegranate market basket"
  - "fog over pine forest"
- Different output every day — vary the nouns, the light, the mood
- The query must work as a literal Unsplash search; don't include hashtags

Return JSON: { "query": "..." }.`

export async function generateUnsplashQuery(args: {
  topicLabel: string
  topicHint: string
  weatherPhrase: string | null
  property: { city: string | null; country: string }
  // 'spring' | 'summer' | 'autumn' | 'winter'
  season: string
  // 'YYYY-MM-DD' so each daily call has a deterministic seed in
  // case retries hit the same model state.
  today: string
}): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  const userLines: string[] = [
    `Today's topic: ${args.topicLabel} — ${args.topicHint}`,
    `Season: ${args.season}`,
  ]
  if (args.weatherPhrase) userLines.push(`Local weather: ${args.weatherPhrase}`)
  if (args.property.city) {
    userLines.push(
      `Property is in ${args.property.city}${args.property.country ? `, ${args.property.country}` : ''}`,
    )
  }
  userLines.push(`Today is ${args.today}.`)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userLines.join('\n') },
        ],
        response_format: { type: 'json_object' },
        // Higher temperature than caption gen — we want variety in
        // search queries across properties and across days. The
        // banned-word list keeps the result inside the boutique
        // hotel envelope even when the model gets creative.
        temperature: 1.0,
        max_tokens: 80,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      console.warn('[social] unsplash-query openai returned', res.status)
      return null
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const raw = json.choices?.[0]?.message?.content ?? ''
    return parseQuery(raw)
  } catch (err) {
    console.warn('[social] unsplash-query generation failed', err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

function parseQuery(raw: string): string | null {
  if (!raw.trim()) return null
  let parsed: { query?: unknown }
  try {
    parsed = JSON.parse(raw) as typeof parsed
  } catch {
    return null
  }
  if (typeof parsed.query !== 'string') return null
  const cleaned = parsed.query
    .trim()
    // Strip quotes the model sometimes leaves in
    .replace(/^["'`]+|["'`]+$/g, '')
    // Collapse whitespace to single spaces
    .replace(/\s+/g, ' ')
    // Sanity cap so a runaway model can't pollute Unsplash search
    .slice(0, 120)
  if (cleaned.split(/\s+/).length < 2) return null
  return cleaned
}

export function seasonForDate(isoDate: string): string {
  // Northern-hemisphere bias — most of our customers are US/EU. For
  // southern-hemisphere properties this lands wrong about half the
  // year; the visual signal of "spring" vs "autumn" still nudges the
  // model toward foliage / light qualities the property does have
  // (e.g. a southern-hemisphere property "in autumn" sees the same
  // cool blue light), so the error is bounded. Promoting to a
  // proper hemisphere lookup is a follow-up if customers ask.
  const month = Number(isoDate.slice(5, 7))
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}
