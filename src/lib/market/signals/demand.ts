import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildCityKey } from '@/lib/market/sources/cleansing'
import type {
  MarketDemandSignal,
  Property,
  PropertyMarketProfile,
  SignalConfidence,
} from '@/lib/supabase/types'

// Build market_demand_signals for a property from real L2 data:
//   - holidays_catalog (Nager.Date)
//   - events_catalog (Wikipedia + later Ticketmaster/Eventbrite)
//   - weather_observations (severe / disruptive forecasts)
//
// Falls back to the heuristic generator in src/lib/market/demand.ts
// when L2 has no rows for the property's geo. The heuristic remains
// the safety net so v1 still shows *something* before sources are
// wired up.

export async function buildDemandSignalsFromRealData(
  property: Property,
  profile: PropertyMarketProfile,
  options: { today?: string; horizonDays?: number } = {},
): Promise<MarketDemandSignal[]> {
  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const horizonDays = options.horizonDays ?? 21
  const horizon = addDays(today, horizonDays)
  const admin = createAdminClient()
  const city_key = buildCityKey({
    city: property.city,
    state: property.state,
    country: property.country,
  })

  type Row = Omit<MarketDemandSignal, 'id' | 'created_at'>
  const rows: Row[] = []

  // 1) Holidays from holidays_catalog.
  const country = (property.country ?? 'US').toUpperCase()
  const { data: holidays } = await admin
    .from('holidays_catalog')
    .select('holiday_date, name, kind')
    .eq('country_code', country)
    .gte('holiday_date', today)
    .lte('holiday_date', horizon)
    .order('holiday_date', { ascending: true })
  const location = profile.location_descriptor ?? property.city ?? 'the local market'

  for (const h of (holidays as Array<{ holiday_date: string; name: string; kind: string }> | null) ?? []) {
    rows.push({
      property_id: property.id,
      org_id: property.org_id,
      signal_date: h.holiday_date,
      signal_key: `holiday:${slug(h.name)}`,
      signal_type: 'holiday',
      headline: `${h.name} — historically a high-demand date for ${location}.`,
      intensity: h.kind === 'public' ? 4 : 3,
      confidence: 'high' as SignalConfidence,
      context: { holiday: h.name, kind: h.kind, source: 'nager_holidays' },
    })
  }

  // 2) Events from events_catalog within this property's geo.
  if (city_key) {
    const { data: events } = await admin
      .from('events_catalog')
      .select('external_source, external_id, name, category, starts_at, ends_at, expected_attendance, attendance_band, confidence')
      .eq('geo_key', city_key)
      .gte('starts_at', `${today}T00:00:00Z`)
      .lte('starts_at', `${horizon}T23:59:59Z`)
      .order('starts_at', { ascending: true })
      .limit(50)
    for (const e of (events as EventRow[] | null) ?? []) {
      const signal_date = e.starts_at.slice(0, 10)
      const intensity = intensityForEvent(e)
      rows.push({
        property_id: property.id,
        org_id: property.org_id,
        signal_date,
        signal_key: `event:${e.external_source}:${slug(e.external_id)}`,
        signal_type: mapCategoryToSignalType(e.category),
        headline: composeEventHeadline(e, location),
        intensity,
        confidence: (e.confidence as SignalConfidence) ?? 'medium',
        context: { source: e.external_source, external_id: e.external_id, category: e.category },
      })
    }
  }

  // 3) Severe weather windows from weather_observations.
  if (property.city) {
    const { data: weather } = await admin
      .from('weather_observations')
      .select('forecast_date, precip_mm, wind_kph_max, conditions, severe_alert, geo_key')
      .gte('forecast_date', today)
      .lte('forecast_date', horizon)
      .limit(500)
    // Match weather rows whose geo_key was emitted for a property in this city.
    // v1: include any weather row with severe_alert or extreme precip / wind.
    for (const w of (weather as WeatherRow[] | null) ?? []) {
      const headline = composeWeatherHeadline(w, location)
      if (!headline) continue
      rows.push({
        property_id: property.id,
        org_id: property.org_id,
        signal_date: w.forecast_date,
        signal_key: `weather:${w.geo_key}:${w.conditions ?? 'severe'}`,
        signal_type: 'compression',
        headline,
        intensity: w.severe_alert ? 4 : 3,
        confidence: 'medium' as SignalConfidence,
        context: { source: 'open_meteo', precip_mm: w.precip_mm, conditions: w.conditions },
      })
    }
  }

  // Persist (idempotent upsert).
  if (rows.length > 0) {
    const { error } = await admin
      .from('market_demand_signals')
      .upsert(rows, {
        onConflict: 'property_id,signal_date,signal_key',
        ignoreDuplicates: false,
      })
    if (error) throw new Error(`buildDemandSignalsFromRealData: ${error.message}`)
  }

  const { data: stored } = await admin
    .from('market_demand_signals')
    .select('*')
    .eq('property_id', property.id)
    .gte('signal_date', today)
    .lte('signal_date', horizon)
    .order('signal_date', { ascending: true })
  return (stored as MarketDemandSignal[] | null) ?? []
}

type EventRow = {
  external_source: string
  external_id: string
  name: string
  category: string
  starts_at: string
  ends_at: string
  expected_attendance: number | null
  attendance_band: string | null
  confidence: string | null
}

type WeatherRow = {
  forecast_date: string
  precip_mm: number | null
  wind_kph_max: number | null
  conditions: string | null
  severe_alert: string | null
  geo_key: string
}

function intensityForEvent(e: EventRow): number {
  switch (e.attendance_band) {
    case 'mega':
      return 5
    case 'large':
      return 4
    case 'medium':
      return 3
    case 'small':
      return 2
    default:
      // No attendance hint — derive from category.
      if (e.category === 'convention' || e.category === 'sports') return 4
      if (e.category === 'concert' || e.category === 'festival') return 3
      return 2
  }
}

function mapCategoryToSignalType(category: string): MarketDemandSignal['signal_type'] {
  switch (category) {
    case 'convention':
      return 'convention'
    case 'concert':
      return 'concert'
    case 'sports':
      return 'sports'
    case 'festival':
      return 'festival'
    case 'holiday':
      return 'holiday'
    default:
      return 'seasonal'
  }
}

function composeEventHeadline(e: EventRow, location: string): string {
  const bandHint =
    e.attendance_band === 'mega' || e.attendance_band === 'large'
      ? ` — expect compressed demand around ${location}.`
      : '.'
  return `${e.name}${bandHint}`
}

function composeWeatherHeadline(w: WeatherRow, location: string): string | null {
  if (w.severe_alert) {
    return `${w.severe_alert} expected near ${location} — likely impact on inbound travel.`
  }
  if ((w.precip_mm ?? 0) >= 25) {
    return `Heavy rain forecast for ${location} (${Math.round(w.precip_mm ?? 0)}mm). May soften walk-in demand.`
  }
  if ((w.wind_kph_max ?? 0) >= 60) {
    return `High winds forecast for ${location} (${Math.round(w.wind_kph_max ?? 0)}kph). Possible travel disruption.`
  }
  return null
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 64)
}
