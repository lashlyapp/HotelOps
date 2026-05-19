import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildCityKey } from '@/lib/market/sources/cleansing'
import type { Property } from '@/lib/supabase/types'

// Build weather_disruption_signals for a property from L2 data:
//   • disruption_observations (NWS alerts: storms, heat, cold, fire)
//   • weather_observations (extreme conditions in the forecast)

export async function buildWeatherDisruptionSignals(
  property: Property,
  options: { today?: string; horizonDays?: number } = {},
): Promise<number> {
  const admin = createAdminClient()
  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const horizonDays = options.horizonDays ?? 14
  const horizon = addDays(today, horizonDays)

  const city_key = buildCityKey({
    city: property.city,
    state: property.state,
    country: property.country,
  })
  const state_key = property.country === 'US' && property.state
    ? `state:US-${property.state.toUpperCase()}`
    : null

  type Row = {
    property_id: string
    org_id: string
    signal_date: string
    kind: string
    intensity: number
    headline: string
    effective_at: string | null
    ends_at: string | null
    source: string
    source_external_id: string | null
  }
  const rows: Row[] = []

  // 1) NWS alerts within window.
  const geoKeys = [city_key, state_key].filter((g): g is string => Boolean(g))
  if (geoKeys.length > 0) {
    const { data: disruptions } = await admin
      .from('disruption_observations')
      .select('source, external_id, kind, severity, effective_at, ends_at, headline, geo_key')
      .in('geo_key', geoKeys)
      .or(`effective_at.is.null,effective_at.lte.${horizon}T23:59:59Z`)
      .or(`ends_at.is.null,ends_at.gte.${today}T00:00:00Z`)
      .limit(50)
    for (const d of (disruptions as DisruptionRow[] | null) ?? []) {
      const signal_date = d.effective_at?.slice(0, 10) ?? today
      rows.push({
        property_id: property.id,
        org_id: property.org_id,
        signal_date,
        kind: d.kind,
        intensity: severityToIntensity(d.severity),
        headline: d.headline,
        effective_at: d.effective_at,
        ends_at: d.ends_at,
        source: d.source,
        source_external_id: d.external_id,
      })
    }
  }

  // 2) Extreme weather in the forecast (Open-Meteo).
  if (city_key) {
    const { data: weather } = await admin
      .from('weather_observations')
      .select('forecast_date, precip_mm, wind_kph_max, conditions, severe_alert, source')
      .gte('forecast_date', today)
      .lte('forecast_date', horizon)
      .limit(500)
    for (const w of (weather as WeatherRow[] | null) ?? []) {
      const kind = classifyWeather(w)
      if (!kind) continue
      const headline = composeWeatherHeadline(w, property.city ?? 'the market')
      if (!headline) continue
      rows.push({
        property_id: property.id,
        org_id: property.org_id,
        signal_date: w.forecast_date,
        kind,
        intensity: w.severe_alert ? 4 : 3,
        headline,
        effective_at: null,
        ends_at: null,
        source: w.source,
        source_external_id: null,
      })
    }
  }

  if (rows.length === 0) return 0
  const { error } = await admin
    .from('weather_disruption_signals')
    .upsert(rows, {
      onConflict: 'property_id,signal_date,kind,source',
      ignoreDuplicates: false,
    })
  if (error) throw new Error(`buildWeatherDisruptionSignals: ${error.message}`)
  return rows.length
}

type DisruptionRow = {
  source: string
  external_id: string | null
  kind: string
  severity: string
  effective_at: string | null
  ends_at: string | null
  headline: string
  geo_key: string
}

type WeatherRow = {
  forecast_date: string
  precip_mm: number | null
  wind_kph_max: number | null
  conditions: string | null
  severe_alert: string | null
  source: string
}

function severityToIntensity(severity: string): number {
  switch (severity) {
    case 'extreme':
      return 5
    case 'high':
      return 4
    case 'medium':
      return 3
    case 'low':
    default:
      return 2
  }
}

function classifyWeather(w: WeatherRow): string | null {
  if (w.severe_alert) return 'storm'
  if ((w.precip_mm ?? 0) >= 40) return 'storm'
  if ((w.wind_kph_max ?? 0) >= 70) return 'storm'
  return null
}

function composeWeatherHeadline(w: WeatherRow, location: string): string | null {
  if (w.severe_alert) return `${w.severe_alert} expected near ${location}.`
  if ((w.precip_mm ?? 0) >= 40) {
    return `Heavy rain forecast for ${location} (${Math.round(w.precip_mm ?? 0)}mm).`
  }
  if ((w.wind_kph_max ?? 0) >= 70) {
    return `High winds forecast for ${location} (${Math.round(w.wind_kph_max ?? 0)}kph).`
  }
  return null
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
