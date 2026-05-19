import type { Adapter, AdapterContext, AdapterResult, Observation } from './types'
import { buildCityKey, buildGeoPointKey, ensureIsoTimestamp, sanitizeText, toFiniteNumber } from './cleansing'

// OpenStreetMap Overpass — free, no key. Returns nearby venues
// (arenas, convention centers, theaters, universities) around each
// property within a 5km radius. Used to anchor events to a real
// venue + to enrich /market with "venues near you" context.
//
// One Overpass query per unique property geo, run weekly.

const BASE = 'https://overpass-api.de/api/interpreter'

const RADIUS_M = 5000

type OverpassElement = {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

type OverpassResponse = { elements?: OverpassElement[] }

export const overpassVenuesAdapter: Adapter = {
  source: 'overpass_venues',
  async run(ctx: AdapterContext): Promise<AdapterResult> {
    const geos = uniqueGeos(ctx.properties)
    const observations: Observation[] = []
    const errors: AdapterResult['errors'] = []
    let api_calls = 0

    for (const geo of geos) {
      const query = buildQuery(geo.latitude, geo.longitude)
      api_calls++
      try {
        const res = await fetch(BASE, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'MyHotelOps/1.0 (https://myhotelops.com, ops@myhotelops.com)',
          },
          body: `data=${encodeURIComponent(query)}`,
        })
        if (!res.ok) {
          errors.push({ message: `Overpass ${geo.geo_key}: HTTP ${res.status}` })
          continue
        }
        const data = (await res.json()) as OverpassResponse
        for (const el of data.elements ?? []) {
          const cleansed = cleanseElement(el, geo)
          if (cleansed) observations.push(cleansed)
        }
      } catch (err) {
        errors.push({
          message: `Overpass ${geo.geo_key}: ${err instanceof Error ? err.message : err}`,
        })
      }
    }

    return { observations, api_calls, errors }
  },
}

function buildQuery(lat: number, lon: number): string {
  // Venues that drive demand + nearby hotels (real competitor
  // discovery — replaces the synthetic name generator in
  // competitors.ts). Hotels are emitted with target_kind='venue'
  // and a payload.kind='hotel' marker so the normalizer routes
  // them to competitor_properties rather than venues_catalog.
  const filters = [
    `node["amenity"="conference_centre"](around:${RADIUS_M},${lat},${lon})`,
    `node["amenity"="theatre"](around:${RADIUS_M},${lat},${lon})`,
    `node["amenity"="university"](around:${RADIUS_M},${lat},${lon})`,
    `node["amenity"="college"](around:${RADIUS_M},${lat},${lon})`,
    `node["amenity"="arts_centre"](around:${RADIUS_M},${lat},${lon})`,
    `node["leisure"="stadium"](around:${RADIUS_M},${lat},${lon})`,
    `node["leisure"="sports_centre"](around:${RADIUS_M},${lat},${lon})`,
    `node["tourism"="attraction"](around:${RADIUS_M},${lat},${lon})`,
    `node["tourism"="hotel"](around:${RADIUS_M},${lat},${lon})`,
    `way["amenity"="conference_centre"](around:${RADIUS_M},${lat},${lon})`,
    `way["leisure"="stadium"](around:${RADIUS_M},${lat},${lon})`,
    `way["tourism"="hotel"](around:${RADIUS_M},${lat},${lon})`,
  ]
  return `[out:json][timeout:25];(${filters.join(';')});out center;`
}

type GeoKey = {
  geo_key: string
  city_key: string | null
  latitude: number
  longitude: number
  property_id: string
  org_id: string
  property_name: string
}

function uniqueGeos(properties: AdapterContext['properties']): GeoKey[] {
  // Hotel discovery is per-property (not per-unique-geo) so each
  // customer property gets its own competitor_properties pool.
  const seen = new Map<string, GeoKey>()
  for (const p of properties) {
    if (p.latitude == null || p.longitude == null) continue
    const geo_key = buildGeoPointKey(p.latitude, p.longitude)
    const key = `${p.id}::${geo_key}`
    if (seen.has(key)) continue
    seen.set(key, {
      geo_key,
      city_key: buildCityKey({ city: p.city, state: p.state, country: p.country }),
      latitude: p.latitude,
      longitude: p.longitude,
      property_id: p.id,
      org_id: p.org_id,
      property_name: p.name,
    })
  }
  return [...seen.values()]
}

function cleanseElement(el: OverpassElement, geo: GeoKey): Observation | null {
  const tags = el.tags ?? {}
  const name = sanitizeText(tags.name, 256)
  if (!name) return null
  const lat = toFiniteNumber(el.lat ?? el.center?.lat)
  const lon = toFiniteNumber(el.lon ?? el.center?.lon)
  if (lat == null || lon == null) return null
  const kind = classifyKind(tags)
  // Exclude the customer's own property from competitor discovery
  // (best-effort name match within ~250m).
  if (kind === 'hotel') {
    const sameName = normalize(name) === normalize(geo.property_name)
    const closeBy = haversineMeters(lat, lon, geo.latitude, geo.longitude) < 250
    if (sameName && closeBy) return null
  }

  return {
    observed_at: ensureIsoTimestamp(new Date().toISOString(), 'now'),
    target_kind: 'venue',
    target_key: `osm:${el.type}:${el.id}`,
    geo_key: geo.geo_key,
    property_id: kind === 'hotel' ? geo.property_id : null,
    org_id: kind === 'hotel' ? geo.org_id : null,
    payload: {
      external_source: 'osm',
      external_id: `${el.type}:${el.id}`,
      name,
      kind,
      capacity: toFiniteNumber(tags.capacity ?? tags['capacity:persons']),
      latitude: lat,
      longitude: lon,
      city_key: geo.city_key,
      stars: toFiniteNumber(tags.stars),
      distance_km:
        kind === 'hotel'
          ? Number((haversineMeters(lat, lon, geo.latitude, geo.longitude) / 1000).toFixed(2))
          : null,
      tags,
    },
    payload_raw: el as unknown as Record<string, unknown>,
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function classifyKind(tags: Record<string, string>): string {
  if (tags['tourism'] === 'hotel') return 'hotel'
  if (tags['amenity'] === 'conference_centre') return 'convention_center'
  if (tags['leisure'] === 'stadium') return 'stadium'
  if (tags['leisure'] === 'sports_centre') return 'sports_centre'
  if (tags['amenity'] === 'theatre' || tags['amenity'] === 'arts_centre') return 'theater'
  if (tags['amenity'] === 'university' || tags['amenity'] === 'college') return 'university'
  if (tags['tourism'] === 'attraction' || tags['tourism'] === 'theme_park' || tags['tourism'] === 'zoo') {
    return 'attraction'
  }
  return 'other'
}
