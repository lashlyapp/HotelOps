import type { Adapter, AdapterContext, AdapterResult, Observation } from './types'
import { ensureIsoTimestamp, sanitizeText } from './cleansing'

// Nager.Date — free, no API key, global public holidays.
// https://date.nager.at/Api
//
// We fetch the current year + next year for every country represented
// by a property. Cleansing: validate date, sanitize name, normalize
// country code to upper.

const BASE = 'https://date.nager.at/api/v3/PublicHolidays'

type NagerRow = {
  date: string
  localName: string
  name: string
  countryCode: string
  fixed?: boolean
  global?: boolean
  counties?: string[] | null
  launchYear?: number | null
  types?: string[] | null
}

export const nagerHolidaysAdapter: Adapter = {
  source: 'nager_holidays',
  async run(ctx: AdapterContext): Promise<AdapterResult> {
    const countries = uniqueCountries(ctx.properties.map((p) => p.country))
    if (countries.length === 0) {
      return { observations: [], api_calls: 0, errors: [] }
    }

    const thisYear = new Date().getUTCFullYear()
    const years = [thisYear, thisYear + 1]
    const observations: Observation[] = []
    const errors: AdapterResult['errors'] = []
    let api_calls = 0

    for (const country of countries) {
      for (const year of years) {
        const url = `${BASE}/${year}/${country}`
        api_calls++
        try {
          const res = await fetch(url, {
            headers: { Accept: 'application/json' },
          })
          if (!res.ok) {
            errors.push({
              message: `Nager.Date ${country} ${year}: HTTP ${res.status}`,
              context: { url },
            })
            continue
          }
          const data = (await res.json()) as NagerRow[]
          for (const row of data) {
            const cleansed = cleanseRow(row, country)
            if (!cleansed) continue
            observations.push(cleansed)
          }
        } catch (err) {
          errors.push({
            message: `Nager.Date ${country} ${year}: ${err instanceof Error ? err.message : err}`,
          })
        }
      }
    }

    return { observations, api_calls, errors }
  },
}

function uniqueCountries(codes: string[]): string[] {
  const set = new Set<string>()
  for (const c of codes) {
    if (!c) continue
    const upper = c.toUpperCase().trim()
    if (upper.length === 2) set.add(upper)
  }
  return [...set]
}

function cleanseRow(row: NagerRow, country: string): Observation | null {
  if (!row?.date || !row?.name) return null
  const observed_at = ensureIsoTimestamp(`${row.date}T00:00:00Z`, 'date')
  const name = sanitizeText(row.localName || row.name, 256)
  if (!name) return null
  const regions = Array.isArray(row.counties) && row.counties.length > 0
    ? row.counties.map((c) => sanitizeText(c, 32)).filter(Boolean) as string[]
    : null
  return {
    observed_at,
    target_kind: 'holiday',
    target_key: `nager:${country}:${row.date}:${row.name}`,
    payload: {
      country_code: country,
      region_codes: regions,
      holiday_date: row.date,
      name,
      english_name: sanitizeText(row.name, 256),
      kind: classify(row.types),
      global: row.global ?? true,
    },
    payload_raw: row as unknown as Record<string, unknown>,
  }
}

function classify(types?: string[] | null): string {
  if (!types || types.length === 0) return 'public'
  const t = types.map((x) => x.toLowerCase())
  if (t.includes('school')) return 'school'
  if (t.includes('observance')) return 'observance'
  if (t.includes('religious')) return 'religious'
  return 'public'
}
