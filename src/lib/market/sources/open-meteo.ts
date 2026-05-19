import type { Adapter, AdapterContext, AdapterResult, Observation } from './types'
import { buildCityKey, buildGeoPointKey, sanitizeText, toFiniteNumber } from './cleansing'

// Open-Meteo — free, no API key, 14-day forecast per geo.
// https://open-meteo.com/en/docs
//
// One API call per unique property geo. Returns a 14-day forecast;
// we emit one Observation per (geo, forecast_date).

const BASE = 'https://api.open-meteo.com/v1/forecast'

type Forecast = {
  latitude: number
  longitude: number
  daily?: {
    time: string[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_sum: number[]
    weather_code: number[]
    wind_speed_10m_max?: number[]
  }
}

export const openMeteoAdapter: Adapter = {
  source: 'open_meteo',
  async run(ctx: AdapterContext): Promise<AdapterResult> {
    const geos = uniqueGeos(ctx.properties)
    const observations: Observation[] = []
    const errors: AdapterResult['errors'] = []
    let api_calls = 0

    for (const geo of geos) {
      const params = new URLSearchParams({
        latitude: geo.latitude.toFixed(4),
        longitude: geo.longitude.toFixed(4),
        daily: [
          'temperature_2m_max',
          'temperature_2m_min',
          'precipitation_sum',
          'weather_code',
          'wind_speed_10m_max',
        ].join(','),
        forecast_days: '14',
        timezone: 'UTC',
      })
      const url = `${BASE}?${params.toString()}`
      api_calls++
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } })
        if (!res.ok) {
          errors.push({ message: `Open-Meteo HTTP ${res.status}`, context: { url } })
          continue
        }
        const data = (await res.json()) as Forecast
        const cleansed = cleanseForecast(data, geo)
        observations.push(...cleansed)
      } catch (err) {
        errors.push({
          message: `Open-Meteo ${geo.geo_key}: ${err instanceof Error ? err.message : err}`,
        })
      }
    }

    return { observations, api_calls, errors }
  },
}

type GeoKey = { latitude: number; longitude: number; geo_key: string; city_key: string | null }

function uniqueGeos(properties: AdapterContext['properties']): GeoKey[] {
  const seen = new Map<string, GeoKey>()
  for (const p of properties) {
    if (p.latitude == null || p.longitude == null) continue
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue
    const geo_key = buildGeoPointKey(p.latitude, p.longitude)
    if (seen.has(geo_key)) continue
    seen.set(geo_key, {
      latitude: p.latitude,
      longitude: p.longitude,
      geo_key,
      city_key: buildCityKey({ city: p.city, state: p.state, country: p.country }),
    })
  }
  return [...seen.values()]
}

function cleanseForecast(data: Forecast, geo: GeoKey): Observation[] {
  if (!data.daily?.time) return []
  const observed_at = new Date().toISOString()
  const out: Observation[] = []
  for (let i = 0; i < data.daily.time.length; i++) {
    const forecast_date = data.daily.time[i]
    if (typeof forecast_date !== 'string') continue
    out.push({
      observed_at,
      target_kind: 'weather',
      target_key: `open_meteo:${geo.geo_key}:${forecast_date}`,
      geo_key: geo.geo_key,
      payload: {
        forecast_date,
        latitude: geo.latitude,
        longitude: geo.longitude,
        city_key: geo.city_key,
        temp_high_c: toFiniteNumber(data.daily.temperature_2m_max?.[i]),
        temp_low_c: toFiniteNumber(data.daily.temperature_2m_min?.[i]),
        precip_mm: toFiniteNumber(data.daily.precipitation_sum?.[i]),
        wind_kph_max: toFiniteNumber(data.daily.wind_speed_10m_max?.[i]),
        weather_code: toFiniteNumber(data.daily.weather_code?.[i]),
        conditions: sanitizeText(describeWeatherCode(data.daily.weather_code?.[i]), 64),
      },
    })
  }
  return out
}

// WMO weather codes condensed into 9 buckets for downstream signal copy.
function describeWeatherCode(code: number | undefined): string {
  if (code == null) return 'unknown'
  if (code === 0) return 'clear'
  if (code <= 3) return 'partly_cloudy'
  if (code >= 45 && code <= 48) return 'fog'
  if (code >= 51 && code <= 67) return 'rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 80 && code <= 82) return 'showers'
  if (code === 85 || code === 86) return 'snow_showers'
  if (code >= 95) return 'thunderstorm'
  return 'unknown'
}
