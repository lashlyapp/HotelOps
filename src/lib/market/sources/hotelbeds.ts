import type { Adapter, AdapterResult, Observation } from './types'
import { toFiniteNumber } from './cleansing'
import { buildRateTargets, type RateCompetitor } from './rate-context'
import { makeObservation } from './booking-affiliate'

// Hotelbeds — Hotel Content + Booking API.
// https://developer.hotelbeds.com/documentation/getting-started/
//
// Auth: API key + Signature header = SHA-256(API_KEY + API_SECRET + unix_seconds).
// Endpoint:
//   POST https://api.test.hotelbeds.com/hotel-api/1.0/hotels
//   body: { stay: { checkIn, checkOut }, occupancies: [{ rooms, adults, children }],
//           hotels: { hotel: [hotelCode, ...] } }

const BASE = 'https://api.hotelbeds.com/hotel-api/1.0/hotels'

export const hotelbedsAdapter: Adapter = {
  source: 'hotelbeds',
  async run(): Promise<AdapterResult> {
    const apiKey = process.env.HOTELBEDS_API_KEY
    const apiSecret = process.env.HOTELBEDS_API_SECRET
    if (!apiKey || !apiSecret) {
      return { observations: [], api_calls: 0, errors: [] }
    }

    const targets = await buildRateTargets({ horizonDays: 14 })
    const observations: Observation[] = []
    const errors: AdapterResult['errors'] = []
    let api_calls = 0

    for (const target of targets) {
      const eligible = target.competitors.filter((c) => c.external_hotelbeds_id)
      if (eligible.length === 0) continue

      for (const date of target.target_dates) {
        const checkout = nextDay(date)
        const body = {
          stay: { checkIn: date, checkOut: checkout },
          occupancies: [{ rooms: 1, adults: 2, children: 0 }],
          hotels: { hotel: eligible.map((c) => Number(c.external_hotelbeds_id)).filter(Number.isFinite) },
        }
        api_calls++
        try {
          const res = await fetch(BASE, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'Api-Key': apiKey,
              'X-Signature': await buildHotelbedsSignature(apiKey, apiSecret),
              'Accept-Encoding': 'gzip',
            },
            body: JSON.stringify(body),
          })
          if (!res.ok) {
            errors.push({
              message: `Hotelbeds ${target.property_id} ${date}: HTTP ${res.status}`,
            })
            continue
          }
          const data = (await res.json()) as HotelbedsResponse
          for (const hotel of data.hotels?.hotels ?? []) {
            const competitor = eligible.find(
              (c) => c.external_hotelbeds_id === String(hotel.code),
            )
            if (!competitor) continue
            const cleansed = cleanseHotel(hotel, competitor, date, target.currency)
            if (cleansed) observations.push(cleansed)
          }
        } catch (err) {
          errors.push({
            message: `Hotelbeds ${target.property_id} ${date}: ${err instanceof Error ? err.message : err}`,
          })
        }
      }
    }

    return { observations, api_calls, errors }
  },
}

async function buildHotelbedsSignature(apiKey: string, apiSecret: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000)
  const { createHash } = await import('node:crypto')
  return createHash('sha256')
    .update(apiKey + apiSecret + String(timestamp))
    .digest('hex')
}

type HotelbedsResponse = {
  hotels?: {
    hotels?: Array<{
      code: number | string
      minRate?: number | string
      maxRate?: number | string
      currency?: string
      rooms?: Array<{
        rates?: Array<{ net?: number | string; allotment?: number }>
      }>
    }>
  }
}

function cleanseHotel(
  hotel: NonNullable<NonNullable<HotelbedsResponse['hotels']>['hotels']>[number],
  competitor: RateCompetitor,
  target_date: string,
  currency: string,
): Observation | null {
  const rateMin = toFiniteNumber(hotel.minRate)
  const rateMax = toFiniteNumber(hotel.maxRate)
  let allotmentMin: number | null = null
  for (const room of hotel.rooms ?? []) {
    for (const rate of room.rates ?? []) {
      const allot = typeof rate.allotment === 'number' ? rate.allotment : null
      if (allot != null) {
        allotmentMin = allotmentMin == null ? allot : Math.min(allotmentMin, allot)
      }
    }
  }
  if (rateMin == null && rateMax == null && allotmentMin == null) return null

  const availability =
    allotmentMin == null
      ? rateMin != null
        ? 'available'
        : 'unknown'
      : allotmentMin === 0
        ? 'sold_out'
        : allotmentMin <= 3
          ? 'limited'
          : 'available'

  return makeObservation({
    competitor,
    target_date,
    currency: hotel.currency ?? currency,
    rate_min: rateMin,
    rate_max: rateMax,
    availability,
    rooms_left_hint: allotmentMin,
  })
}

function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
