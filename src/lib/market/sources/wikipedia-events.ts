import type { Adapter, AdapterContext, AdapterResult, Observation } from './types'
import { buildCityKey, ensureIsoTimestamp, sanitizeText, stripPii } from './cleansing'

// Wikipedia events — free, no API key. We use the MediaWiki action API
// (`prop=links` and `prop=extracts`) against "<City>" articles to pull
// annual recurring events (festivals, conventions, marathons) that
// Wikipedia lists in their "Events" section. v1 is intentionally simple:
//
//   1. For each unique city, fetch the city's article extract
//   2. Find lines that look like "<Event name> — <month>" or
//      "<Event name>, held annually in <month>"
//   3. Schedule a synthetic instance of each event in the next 12
//      months using the parsed month
//
// This is *much* coarser than Ticketmaster but works with zero API
// keys and zero approvals. Once Ticketmaster + Eventbrite land,
// Wikipedia becomes the long-tail fallback covering events the paid
// feeds miss.

const BASE = 'https://en.wikipedia.org/w/api.php'

const MONTHS: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
}

const EVENT_KEYWORDS = [
  'festival',
  'marathon',
  'half marathon',
  'convention',
  'parade',
  'fair',
  'expo',
  'regatta',
  'rodeo',
  'jamboree',
]

export const wikipediaEventsAdapter: Adapter = {
  source: 'wikipedia_events',
  async run(ctx: AdapterContext): Promise<AdapterResult> {
    const cities = uniqueCities(ctx.properties)
    const observations: Observation[] = []
    const errors: AdapterResult['errors'] = []
    let api_calls = 0

    for (const city of cities) {
      const params = new URLSearchParams({
        action: 'query',
        prop: 'extracts',
        explaintext: '1',
        format: 'json',
        titles: city.title,
        redirects: '1',
        origin: '*',
      })
      api_calls++
      try {
        const res = await fetch(`${BASE}?${params.toString()}`, {
          headers: { Accept: 'application/json', 'User-Agent': 'MyHotelOps/1.0 (https://myhotelops.com)' },
        })
        if (!res.ok) {
          errors.push({ message: `Wikipedia HTTP ${res.status} for ${city.title}` })
          continue
        }
        const data = (await res.json()) as WikiResponse
        const extract = extractFromResponse(data)
        if (!extract) continue
        const events = parseEvents(extract, city)
        observations.push(...events)
      } catch (err) {
        errors.push({
          message: `Wikipedia ${city.title}: ${err instanceof Error ? err.message : err}`,
        })
      }
    }

    return { observations, api_calls, errors }
  },
}

type WikiResponse = {
  query?: {
    pages?: Record<string, { extract?: string }>
  }
}

function extractFromResponse(data: WikiResponse): string | null {
  const pages = data.query?.pages
  if (!pages) return null
  for (const page of Object.values(pages)) {
    if (page.extract) return page.extract
  }
  return null
}

type CityKey = { title: string; geo_key: string; city: string; state: string | null; country: string }

function uniqueCities(properties: AdapterContext['properties']): CityKey[] {
  const seen = new Map<string, CityKey>()
  for (const p of properties) {
    if (!p.city) continue
    // Wikipedia titles are typically "City" or "City, State" (US).
    const title = p.country === 'US' && p.state ? `${p.city}, ${p.state}` : p.city
    const geo_key = buildCityKey({ city: p.city, state: p.state, country: p.country }) ?? ''
    if (!geo_key || seen.has(geo_key)) continue
    seen.set(geo_key, { title, geo_key, city: p.city, state: p.state, country: p.country })
  }
  return [...seen.values()]
}

function parseEvents(extract: string, city: CityKey): Observation[] {
  const lines = extract.split('\n')
  const out: Observation[] = []
  const seen = new Set<string>()
  const now = new Date()

  for (const raw of lines) {
    const line = stripPii(raw).trim()
    if (line.length < 8 || line.length > 400) continue
    const lower = line.toLowerCase()
    if (!EVENT_KEYWORDS.some((kw) => lower.includes(kw))) continue
    // Find a month token.
    let monthIdx: number | null = null
    let monthName: string | null = null
    for (const [token, idx] of Object.entries(MONTHS)) {
      const re = new RegExp(`\\b${token}\\b`, 'i')
      if (re.test(line)) {
        monthIdx = idx
        monthName = token
        break
      }
    }
    if (monthIdx == null) continue
    const name = extractEventName(line)
    if (!name) continue
    const key = `${city.geo_key}::${name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    // Place the event on the 15th of the parsed month, current year
    // or next year if the month is already past. Multi-day default 3.
    let year = now.getUTCFullYear()
    const candidate = new Date(Date.UTC(year, monthIdx, 15))
    if (candidate < now) year += 1
    const start = new Date(Date.UTC(year, monthIdx, 15))
    const end = new Date(Date.UTC(year, monthIdx, 17))

    out.push({
      observed_at: ensureIsoTimestamp(new Date().toISOString(), 'now'),
      target_kind: 'event',
      target_key: `wikipedia:${city.geo_key}:${slug(name)}:${year}-${String(monthIdx + 1).padStart(2, '0')}`,
      geo_key: city.geo_key,
      payload: {
        name,
        category: classifyName(name),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        confidence: 'low',
        source_excerpt: sanitizeText(line, 512),
        parsed_month: monthName,
        attendance_band: null,
      },
      payload_raw: { line },
    })
  }
  return out
}

function extractEventName(line: string): string | null {
  // Heuristic: the event name is the longest substring before a comma,
  // colon, or em dash. Drop trailing/leading punctuation.
  const cut = line.split(/[,:—–-]/)[0]?.trim()
  if (!cut) return null
  const cleaned = sanitizeText(cut.replace(/^["'`]+|["'`]+$/g, ''), 200)
  if (!cleaned || cleaned.length < 4) return null
  return cleaned
}

function classifyName(name: string): string {
  const l = name.toLowerCase()
  if (l.includes('marathon') || l.includes('regatta') || l.includes('rodeo')) return 'sports'
  if (l.includes('convention') || l.includes('expo')) return 'convention'
  if (l.includes('parade')) return 'festival'
  if (l.includes('jamboree') || l.includes('fair')) return 'festival'
  return 'festival'
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 64)
}
