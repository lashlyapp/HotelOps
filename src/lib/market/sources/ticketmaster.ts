import type { Adapter, AdapterContext, AdapterResult, Observation } from './types'
import { buildCityKey, ensureIsoTimestamp, sanitizeText, slugify } from './cleansing'

// Ticketmaster Discovery API — free, 5k calls/day. Concerts, sports,
// theater, comedy within a geo radius.
// https://developer.ticketmaster.com/api-explorer/v2/

const BASE = 'https://app.ticketmaster.com/discovery/v2/events.json'
const RADIUS_MI = '25'

type Event = {
  id: string
  name: string
  url?: string
  dates?: {
    start?: { dateTime?: string; localDate?: string; localTime?: string }
    end?: { dateTime?: string }
  }
  classifications?: Array<{ segment?: { name?: string }; genre?: { name?: string } }>
  _embedded?: {
    venues?: Array<{
      name?: string
      id?: string
      city?: { name?: string }
      state?: { stateCode?: string; name?: string }
      country?: { countryCode?: string }
      location?: { latitude?: string; longitude?: string }
      capacity?: number
    }>
  }
}

type Response = { _embedded?: { events?: Event[] } }

export const ticketmasterAdapter: Adapter = {
  source: 'ticketmaster',
  async run(ctx: AdapterContext): Promise<AdapterResult> {
    const apiKey = process.env.TICKETMASTER_API_KEY
    if (!apiKey) return { observations: [], api_calls: 0, errors: [] }

    const geos = uniqueGeos(ctx.properties)
    const observations: Observation[] = []
    const errors: AdapterResult['errors'] = []
    let api_calls = 0

    const startDateTime = new Date().toISOString().split('.')[0] + 'Z'
    const endDateTime = (() => {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() + 90)
      return d.toISOString().split('.')[0] + 'Z'
    })()

    for (const geo of geos) {
      const params = new URLSearchParams({
        apikey: apiKey,
        latlong: `${geo.latitude},${geo.longitude}`,
        radius: RADIUS_MI,
        unit: 'miles',
        startDateTime,
        endDateTime,
        size: '100',
        sort: 'date,asc',
      })
      api_calls++
      try {
        const res = await fetch(`${BASE}?${params.toString()}`, {
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) {
          errors.push({ message: `Ticketmaster ${geo.geo_key}: HTTP ${res.status}` })
          continue
        }
        const data = (await res.json()) as Response
        for (const event of data._embedded?.events ?? []) {
          const cleansed = cleanseEvent(event, geo)
          if (cleansed) observations.push(cleansed)
        }
      } catch (err) {
        errors.push({
          message: `Ticketmaster ${geo.geo_key}: ${err instanceof Error ? err.message : err}`,
        })
      }
    }

    return { observations, api_calls, errors }
  },
}

type GeoKey = { geo_key: string; latitude: number; longitude: number; city_key: string | null }

function uniqueGeos(properties: AdapterContext['properties']): GeoKey[] {
  const seen = new Map<string, GeoKey>()
  for (const p of properties) {
    if (p.latitude == null || p.longitude == null) continue
    const geo_key = `geo:${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`
    if (seen.has(geo_key)) continue
    seen.set(geo_key, {
      geo_key,
      latitude: p.latitude,
      longitude: p.longitude,
      city_key: buildCityKey({ city: p.city, state: p.state, country: p.country }),
    })
  }
  return [...seen.values()]
}

function cleanseEvent(event: Event, geo: GeoKey): Observation | null {
  if (!event.id || !event.name) return null
  const start = event.dates?.start?.dateTime ?? event.dates?.start?.localDate
  if (!start) return null
  const starts_at = ensureIsoTimestamp(
    event.dates?.start?.dateTime ?? `${event.dates?.start?.localDate}T${event.dates?.start?.localTime ?? '20:00:00'}Z`,
    'start',
  )
  const ends_at = event.dates?.end?.dateTime
    ? ensureIsoTimestamp(event.dates.end.dateTime, 'end')
    : starts_at

  const segment = event.classifications?.[0]?.segment?.name?.toLowerCase() ?? ''
  const category = mapSegmentToCategory(segment)
  const venue = event._embedded?.venues?.[0]
  const venueCity = venue?.city?.name
  const venueState = venue?.state?.stateCode
  const venueCountry = venue?.country?.countryCode
  const venueGeo = venueCity
    ? buildCityKey({ city: venueCity, state: venueState ?? null, country: venueCountry ?? null })
    : geo.city_key

  const expected_attendance = typeof venue?.capacity === 'number' ? venue.capacity : null

  return {
    observed_at: ensureIsoTimestamp(new Date().toISOString(), 'now'),
    target_kind: 'event',
    target_key: `ticketmaster:${event.id}`,
    geo_key: venueGeo ?? geo.geo_key,
    payload: {
      name: sanitizeText(event.name, 256),
      category,
      starts_at,
      ends_at,
      expected_attendance,
      attendance_band: bandForCapacity(expected_attendance),
      source_url: sanitizeText(event.url ?? null, 512),
      confidence: 'high',
      venue: venue
        ? {
            external_id: venue.id ?? null,
            name: sanitizeText(venue.name ?? null, 256),
            latitude: venue.location?.latitude ? Number(venue.location.latitude) : null,
            longitude: venue.location?.longitude ? Number(venue.location.longitude) : null,
            city: sanitizeText(venueCity ?? null, 128),
          }
        : null,
      slug: slugify(event.name),
    },
    payload_raw: event as unknown as Record<string, unknown>,
  }
}

function mapSegmentToCategory(segment: string): string {
  if (segment.includes('music')) return 'concert'
  if (segment.includes('sport')) return 'sports'
  if (segment.includes('arts')) return 'festival'
  if (segment.includes('film')) return 'festival'
  return 'other'
}

function bandForCapacity(capacity: number | null): string | null {
  if (capacity == null || capacity <= 0) return null
  if (capacity >= 20000) return 'mega'
  if (capacity >= 5000) return 'large'
  if (capacity >= 1000) return 'medium'
  return 'small'
}
