import type { Adapter, AdapterResult, Observation } from './types'
import { toFiniteNumber } from './cleansing'
import { buildRateTargets, type RateCompetitor } from './rate-context'
import { makeObservation } from './booking-affiliate'

// Expedia Group Rapid API adapter — Shop Availability v3.
// https://developers.expediagroup.com/docs/rapid/lodging/availability/property-availability
//
// Auth: API key + Signature header per Expedia's standard. v1 uses
// the simpler API-key flow (EAN sandbox / production) gated on:
//   EXPEDIA_RAPID_API_KEY
//   EXPEDIA_RAPID_API_SECRET   (used to compute Signature header)
//
// Endpoint:
//   GET /v3/properties/availability
//   ?checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&currency=USD
//   &property_id=<id>&property_id=<id>…&occupancy=2

const BASE = 'https://api.ean.com/v3/properties/availability'

export const expediaRapidAdapter: Adapter = {
  source: 'expedia_rapid',
  async run(): Promise<AdapterResult> {
    const apiKey = process.env.EXPEDIA_RAPID_API_KEY
    const apiSecret = process.env.EXPEDIA_RAPID_API_SECRET
    if (!apiKey || !apiSecret) {
      return { observations: [], api_calls: 0, errors: [] }
    }

    const targets = await buildRateTargets({ horizonDays: 14 })
    const observations: Observation[] = []
    const errors: AdapterResult['errors'] = []
    let api_calls = 0

    for (const target of targets) {
      const eligible = target.competitors.filter((c) => c.external_expedia_id)
      if (eligible.length === 0) continue

      for (const date of target.target_dates) {
        const checkout = nextDay(date)
        const params = new URLSearchParams({
          checkin: date,
          checkout,
          currency: target.currency,
          occupancy: '2',
          sales_channel: 'website',
          sales_environment: 'hotel_only',
        })
        for (const c of eligible) {
          if (c.external_expedia_id) params.append('property_id', c.external_expedia_id)
        }
        api_calls++
        try {
          const res = await fetch(`${BASE}?${params.toString()}`, {
            headers: {
              Accept: 'application/json',
              Authorization: await buildEpsSignature(apiKey, apiSecret),
              'Customer-Ip': '0.0.0.0',
              'Accept-Encoding': 'gzip',
            },
          })
          if (!res.ok) {
            errors.push({
              message: `Expedia ${target.property_id} ${date}: HTTP ${res.status}`,
            })
            continue
          }
          const data = (await res.json()) as ExpediaResponse
          for (const propertyResult of data ?? []) {
            const competitor = eligible.find(
              (c) => c.external_expedia_id === String(propertyResult.property_id),
            )
            if (!competitor) continue
            const cleansed = cleanseProperty(propertyResult, competitor, date, target.currency)
            if (cleansed) observations.push(cleansed)
          }
        } catch (err) {
          errors.push({
            message: `Expedia ${target.property_id} ${date}: ${err instanceof Error ? err.message : err}`,
          })
        }
      }
    }

    return { observations, api_calls, errors }
  },
}

// EPS signature: SHA-512 of (apiKey + apiSecret + unix_seconds), per
// Expedia Rapid docs. The header is "EAN APIKey=<key>,Signature=<hex>,timestamp=<sec>".
async function buildEpsSignature(apiKey: string, apiSecret: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000)
  const { createHash } = await import('node:crypto')
  const signature = createHash('sha512')
    .update(apiKey + apiSecret + String(timestamp))
    .digest('hex')
  return `EAN APIKey=${apiKey},Signature=${signature},timestamp=${timestamp}`
}

type ExpediaResponse = Array<{
  property_id: number | string
  rooms?: Array<{
    rates?: Array<{
      occupancy_pricing?: {
        '2'?: { totals?: { inclusive?: { value?: number } }; nightly?: Array<{ value?: number }> }
      }
      available_rooms?: number
    }>
  }>
}>

function cleanseProperty(
  result: ExpediaResponse[number],
  competitor: RateCompetitor,
  target_date: string,
  currency: string,
): Observation | null {
  const rates: number[] = []
  let availableRoomsMin: number | null = null
  for (const room of result.rooms ?? []) {
    for (const rate of room.rates ?? []) {
      const total = toFiniteNumber(rate.occupancy_pricing?.['2']?.totals?.inclusive?.value)
      const nightly = toFiniteNumber(rate.occupancy_pricing?.['2']?.nightly?.[0]?.value)
      const v = nightly ?? total
      if (v != null) rates.push(v)
      const avail = typeof rate.available_rooms === 'number' ? rate.available_rooms : null
      if (avail != null) {
        availableRoomsMin = availableRoomsMin == null ? avail : Math.min(availableRoomsMin, avail)
      }
    }
  }

  if (rates.length === 0 && availableRoomsMin === null) {
    return makeObservation({
      competitor,
      target_date,
      currency,
      rate_min: null,
      rate_max: null,
      availability: 'sold_out',
      rooms_left_hint: 0,
    })
  }

  const rate_min = rates.length > 0 ? Math.min(...rates) : null
  const rate_max = rates.length > 0 ? Math.max(...rates) : null
  const availability =
    availableRoomsMin == null
      ? rates.length > 0
        ? 'available'
        : 'unknown'
      : availableRoomsMin === 0
        ? 'sold_out'
        : availableRoomsMin <= 3
          ? 'limited'
          : 'available'

  return makeObservation({
    competitor,
    target_date,
    currency,
    rate_min,
    rate_max,
    availability,
    rooms_left_hint: availableRoomsMin,
  })
}

function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
