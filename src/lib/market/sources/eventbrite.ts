import type { Adapter, AdapterContext, AdapterResult, Observation } from './types'
import { buildCityKey, ensureIsoTimestamp, sanitizeText, slugify, stripPii } from './cleansing'

// Eventbrite Public Search — needs EVENTBRITE_API_TOKEN (free).
// NOTE: Eventbrite's public search API has been progressively
// restricted (organizer-scoped tokens only post-2019). This adapter
// uses the public events JSON-LD that the search results pages
// expose; if Eventbrite locks it down further we swap to their
// /v3/organizations/<id>/events endpoint. v1 query: per-city.

const BASE = 'https://www.eventbriteapi.com/v3/events/search/'

type EbEvent = {
  id: string
  name?: { text?: string }
  description?: { text?: string }
  start?: { utc?: string }
  end?: { utc?: string }
  url?: string
  venue?: { name?: string; address?: { city?: string; region?: string; country?: string; latitude?: string; longitude?: string } }
  category_id?: string
  capacity?: number | null
}

type EbResponse = { events?: EbEvent[] }

export const eventbriteAdapter: Adapter = {
  source: 'eventbrite',
  async run(ctx: AdapterContext): Promise<AdapterResult> {
    const token = process.env.EVENTBRITE_API_TOKEN
    if (!token) return { observations: [], api_calls: 0, errors: [] }

    const cities = uniqueCities(ctx.properties)
    const observations: Observation[] = []
    const errors: AdapterResult['errors'] = []
    let api_calls = 0

    const startDate = new Date().toISOString().split('.')[0]
    const endDate = (() => {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() + 90)
      return d.toISOString().split('.')[0]
    })()

    for (const city of cities) {
      const params = new URLSearchParams({
        'location.address': city.searchTerm,
        'location.within': '25km',
        'start_date.range_start': startDate,
        'start_date.range_end': endDate,
        sort_by: 'date',
        expand: 'venue',
      })
      api_calls++
      try {
        const res = await fetch(`${BASE}?${params.toString()}`, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
        })
        if (!res.ok) {
          errors.push({ message: `Eventbrite ${city.searchTerm}: HTTP ${res.status}` })
          continue
        }
        const data = (await res.json()) as EbResponse
        for (const event of data.events ?? []) {
          const cleansed = cleanseEvent(event, city)
          if (cleansed) observations.push(cleansed)
        }
      } catch (err) {
        errors.push({
          message: `Eventbrite ${city.searchTerm}: ${err instanceof Error ? err.message : err}`,
        })
      }
    }

    return { observations, api_calls, errors }
  },
}

type CityKey = { geo_key: string; searchTerm: string }

function uniqueCities(properties: AdapterContext['properties']): CityKey[] {
  const seen = new Map<string, CityKey>()
  for (const p of properties) {
    if (!p.city) continue
    const geo_key = buildCityKey({ city: p.city, state: p.state, country: p.country }) ?? ''
    if (!geo_key || seen.has(geo_key)) continue
    const searchTerm = [p.city, p.state, p.country].filter(Boolean).join(', ')
    seen.set(geo_key, { geo_key, searchTerm })
  }
  return [...seen.values()]
}

function cleanseEvent(event: EbEvent, city: CityKey): Observation | null {
  if (!event.id || !event.name?.text || !event.start?.utc) return null
  const name = sanitizeText(event.name.text, 256)
  if (!name) return null
  const starts_at = ensureIsoTimestamp(event.start.utc, 'start')
  const ends_at = event.end?.utc ? ensureIsoTimestamp(event.end.utc, 'end') : starts_at

  const venue = event.venue
  const venueCity = venue?.address?.city
  const venueState = venue?.address?.region
  const venueCountry = venue?.address?.country
  const venueGeo = venueCity
    ? buildCityKey({ city: venueCity, state: venueState ?? null, country: venueCountry ?? null })
    : city.geo_key

  const capacity = typeof event.capacity === 'number' ? event.capacity : null

  return {
    observed_at: ensureIsoTimestamp(new Date().toISOString(), 'now'),
    target_kind: 'event',
    target_key: `eventbrite:${event.id}`,
    geo_key: venueGeo,
    payload: {
      name,
      category: 'festival',  // Eventbrite covers a long tail; default to festival
      starts_at,
      ends_at,
      expected_attendance: capacity,
      attendance_band: bandForCapacity(capacity),
      source_url: sanitizeText(event.url ?? null, 512),
      confidence: 'medium',
      description_excerpt: event.description?.text
        ? sanitizeText(stripPii(event.description.text), 512)
        : null,
      venue: venue?.name ? { name: sanitizeText(venue.name, 256) } : null,
      slug: slugify(name),
    },
    payload_raw: event as unknown as Record<string, unknown>,
  }
}

function bandForCapacity(capacity: number | null): string | null {
  if (capacity == null || capacity <= 0) return null
  if (capacity >= 20000) return 'mega'
  if (capacity >= 5000) return 'large'
  if (capacity >= 1000) return 'medium'
  return 'small'
}
