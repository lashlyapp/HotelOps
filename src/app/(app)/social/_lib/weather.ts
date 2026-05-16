import 'server-only'
import { unstable_cache } from 'next/cache'

// Open-Meteo: free, no API key, generous limits. We use two endpoints:
//
//   1. geocoding-api.open-meteo.com  — city/country → lat/long
//   2. api.open-meteo.com            — lat/long → today's weather
//
// Both results are cached for 6 hours. The weather phrase only needs
// to be roughly accurate ("sunny and warm", "overcast and cool"), so
// staleness in either dimension is fine.

export type WeatherSummary = {
  // Human phrase the generator splices into the prompt. Empty string
  // when we couldn't determine weather (no city set, geocode miss,
  // upstream error).
  phrase: string
  // Raw temperature in Celsius for the prompt's own use. Null when
  // the lookup failed.
  temperatureC: number | null
  // 'sunny', 'cloudy', 'rainy', 'snowy', 'foggy', or null.
  condition: WeatherCondition | null
}

export type WeatherCondition = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'foggy'

const EMPTY: WeatherSummary = { phrase: '', temperatureC: null, condition: null }

export async function getWeatherForProperty(
  city: string | null,
  country: string,
): Promise<WeatherSummary> {
  if (!city) return EMPTY
  try {
    const coords = await geocode(city, country)
    if (!coords) return EMPTY
    return await fetchWeather(coords.latitude, coords.longitude)
  } catch (err) {
    console.warn('[social] weather lookup failed', err)
    return EMPTY
  }
}

const GEOCODE_TIMEOUT_MS = 4000
const WEATHER_TIMEOUT_MS = 4000

async function geocode(
  city: string,
  country: string,
): Promise<{ latitude: number; longitude: number } | null> {
  return unstable_cache(
    async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS)
      try {
        const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
        url.searchParams.set('name', city)
        url.searchParams.set('count', '1')
        url.searchParams.set('language', 'en')
        url.searchParams.set('format', 'json')
        if (country) url.searchParams.set('country', country)
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) return null
        const json = (await res.json()) as {
          results?: { latitude?: number; longitude?: number }[]
        }
        const r = json.results?.[0]
        if (!r || typeof r.latitude !== 'number' || typeof r.longitude !== 'number') {
          return null
        }
        return { latitude: r.latitude, longitude: r.longitude }
      } finally {
        clearTimeout(timer)
      }
    },
    ['social-geocode', city, country],
    { revalidate: 60 * 60 * 24 * 30 }, // 30 days — places don't move
  )()
}

async function fetchWeather(
  lat: number,
  lon: number,
): Promise<WeatherSummary> {
  return unstable_cache(
    async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS)
      try {
        const url = new URL('https://api.open-meteo.com/v1/forecast')
        url.searchParams.set('latitude', lat.toFixed(3))
        url.searchParams.set('longitude', lon.toFixed(3))
        url.searchParams.set('current', 'temperature_2m,weather_code')
        url.searchParams.set('timezone', 'auto')
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) return EMPTY
        const json = (await res.json()) as {
          current?: { temperature_2m?: number; weather_code?: number }
        }
        const temperatureC = json.current?.temperature_2m ?? null
        const condition = mapWmoCode(json.current?.weather_code)
        const phrase = describe(temperatureC, condition)
        return { phrase, temperatureC, condition }
      } finally {
        clearTimeout(timer)
      }
    },
    ['social-weather', lat.toFixed(2), lon.toFixed(2)],
    { revalidate: 60 * 60 * 6 }, // 6h — enough resolution for "vibe"
  )()
}

// WMO weather codes → coarse buckets we actually use in prompts.
// https://open-meteo.com/en/docs (search "weather_code").
function mapWmoCode(code: number | undefined): WeatherCondition | null {
  if (code === undefined) return null
  if (code === 0 || code === 1) return 'sunny'
  if (code === 2 || code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'foggy'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rainy'
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snowy'
  if (code >= 95) return 'rainy' // thunderstorms — treat as rainy for caption purposes
  return null
}

function describe(
  tempC: number | null,
  condition: WeatherCondition | null,
): string {
  if (condition === null && tempC === null) return ''
  const tempPart =
    tempC === null
      ? ''
      : tempC <= 5
        ? 'cold'
        : tempC <= 12
          ? 'cool'
          : tempC <= 22
            ? 'mild'
            : tempC <= 30
              ? 'warm'
              : 'hot'
  const conditionPart =
    condition === null
      ? ''
      : condition === 'sunny'
        ? 'sunny'
        : condition === 'cloudy'
          ? 'overcast'
          : condition === 'rainy'
            ? 'rainy'
            : condition === 'snowy'
              ? 'snowy'
              : 'foggy'
  if (tempPart && conditionPart) return `${conditionPart} and ${tempPart}`
  return conditionPart || tempPart
}
