import type { Adapter, AdapterContext, AdapterResult, Observation } from './types'
import { buildCityKey, ensureIsoTimestamp, toFiniteNumber } from './cleansing'

// Wikipedia pageviews — free, official API, no key.
// https://wikitech.wikimedia.org/wiki/Analytics/AQS/Pageviews
//
// For each unique destination city, fetch daily pageviews on the
// city's Wikipedia article for the last 60 days. Used as a leading
// indicator of destination demand 2-6 weeks out.

const BASE =
  'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents'

type PageviewResponse = {
  items?: Array<{
    article: string
    timestamp: string // YYYYMMDDHH
    views: number
  }>
}

export const wikipediaPageviewsAdapter: Adapter = {
  source: 'wikipedia_pageviews',
  async run(ctx: AdapterContext): Promise<AdapterResult> {
    const cities = uniqueCities(ctx.properties)
    if (cities.length === 0) return { observations: [], api_calls: 0, errors: [] }

    const observations: Observation[] = []
    const errors: AdapterResult['errors'] = []
    let api_calls = 0

    const now = new Date()
    const end = formatYmd(addDays(now, -1)) // yesterday
    const start = formatYmd(addDays(now, -60))

    for (const city of cities) {
      const article = encodeArticle(city.title)
      const url = `${BASE}/${article}/daily/${start}/${end}`
      api_calls++
      try {
        const res = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'MyHotelOps/1.0 (https://myhotelops.com, ops@myhotelops.com)',
          },
        })
        if (!res.ok) {
          // Many city articles 404 — that's fine, just skip silently
          // for 404s.
          if (res.status !== 404) {
            errors.push({ message: `Wikipedia pageviews ${city.title}: HTTP ${res.status}` })
          }
          continue
        }
        const data = (await res.json()) as PageviewResponse
        for (const item of data.items ?? []) {
          const cleansed = cleanseItem(item, city)
          if (cleansed) observations.push(cleansed)
        }
      } catch (err) {
        errors.push({
          message: `Wikipedia pageviews ${city.title}: ${err instanceof Error ? err.message : err}`,
        })
      }
    }

    return { observations, api_calls, errors }
  },
}

type CityKey = { title: string; geo_key: string }

function uniqueCities(properties: AdapterContext['properties']): CityKey[] {
  const seen = new Map<string, CityKey>()
  for (const p of properties) {
    if (!p.city) continue
    const geo_key = buildCityKey({ city: p.city, state: p.state, country: p.country }) ?? ''
    if (!geo_key || seen.has(geo_key)) continue
    const title = p.country === 'US' && p.state ? `${p.city}, ${p.state}` : p.city
    seen.set(geo_key, { title: title.replace(/ /g, '_'), geo_key })
  }
  return [...seen.values()]
}

function encodeArticle(title: string): string {
  // Spaces already converted to underscores; encodeURIComponent
  // handles the rest (commas, accents).
  return encodeURIComponent(title)
}

function cleanseItem(
  item: { article: string; timestamp: string; views: number },
  city: CityKey,
): Observation | null {
  const views = toFiniteNumber(item.views)
  if (views == null || views < 0) return null
  // timestamp = YYYYMMDDHH; treat as the measurement_date (UTC day).
  const ymd = item.timestamp.slice(0, 8)
  if (ymd.length !== 8) return null
  const measurement_date = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
  const observed_at = ensureIsoTimestamp(new Date().toISOString(), 'now')

  return {
    observed_at,
    target_kind: 'pageview',
    target_key: `wp:${item.article}:${measurement_date}`,
    geo_key: city.geo_key,
    payload: {
      query: `wikipedia:${item.article}`,
      source: 'wikipedia_pageviews',
      measurement_date,
      score: views,
      source_market: null,
    },
    payload_raw: item as unknown as Record<string, unknown>,
  }
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime())
  out.setUTCDate(out.getUTCDate() + n)
  return out
}

function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}
