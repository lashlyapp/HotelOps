import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AdapterContext } from './types'

// Build the AdapterContext (list of properties with geos) used by
// per-property adapters. Loaded fresh on each cron run.

export async function buildAdapterContext(): Promise<AdapterContext> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('properties')
    .select('id, org_id, city, state, country, address_line1, postal_code')
  if (error) throw new Error(`buildAdapterContext: ${error.message}`)

  // Properties don't yet have lat/lon columns. v1 sources that need
  // them (Open-Meteo) fall back to a simple per-city geocode cache
  // keyed off city + state + country. The geocode lookup is also
  // free (Open-Meteo geocoding API), so v1 just inlines it.
  const propertiesWithGeo = await Promise.all(
    ((data as PropertyRow[] | null) ?? []).map(async (p) => {
      const geo = await geocodeCity(p)
      return {
        id: p.id,
        org_id: p.org_id,
        city: p.city,
        state: p.state,
        country: p.country,
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
      }
    }),
  )

  return { properties: propertiesWithGeo }
}

type PropertyRow = {
  id: string
  org_id: string
  city: string | null
  state: string | null
  country: string
  address_line1: string | null
  postal_code: string | null
}

// Open-Meteo geocoding — free, no key. Cached in-process to avoid
// re-geocoding the same city on every cron run.
const geocodeCache = new Map<string, { latitude: number; longitude: number } | null>()

async function geocodeCity(p: PropertyRow): Promise<{ latitude: number; longitude: number } | null> {
  if (!p.city) return null
  const key = [p.city, p.state, p.country].filter(Boolean).join('|')
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null
  const params = new URLSearchParams({
    name: p.city,
    count: '1',
    language: 'en',
    format: 'json',
  })
  if (p.country) params.set('country', p.country.toUpperCase())
  const url = `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) {
      geocodeCache.set(key, null)
      return null
    }
    const data = (await res.json()) as { results?: Array<{ latitude: number; longitude: number }> }
    const hit = data.results?.[0]
    if (!hit) {
      geocodeCache.set(key, null)
      return null
    }
    const out = { latitude: hit.latitude, longitude: hit.longitude }
    geocodeCache.set(key, out)
    return out
  } catch {
    geocodeCache.set(key, null)
    return null
  }
}
