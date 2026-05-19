import type { Adapter, AdapterResult, Observation } from './types'
import { ensureIsoTimestamp, sanitizeText, toFiniteNumber } from './cleansing'
import { buildRateTargets, expiresInOneDay, type RateCompetitor } from './rate-context'

// Booking.com Affiliate Partner Distribution API adapter.
// Reference shape — confirm endpoint + auth header at integration
// time with the actual affiliate dashboard documentation; the
// affiliate API surface has multiple versions in the wild.
//
// Auth: HTTP Basic, base64(${BOOKING_AFFILIATE_USERNAME}:${BOOKING_AFFILIATE_PASSWORD}).
// Endpoint pattern (Distribution v2):
//   POST https://distribution-xml.booking.com/json/bookings.getHotelAvailabilityV2
//   body: { hotel_ids, checkin, checkout, currency }
//
// v1 of this adapter: one HTTP call per (competitor, check-in date),
// with checkout = check-in + 1. Cheaper batching is possible (the
// API accepts arrays); we add it later once we have real traffic
// data on call shape.

const ENDPOINT = 'https://distribution-xml.booking.com/json/bookings.getHotelAvailabilityV2'

export const bookingAffiliateAdapter: Adapter = {
  source: 'booking_affiliate',
  async run(): Promise<AdapterResult> {
    const username = process.env.BOOKING_AFFILIATE_USERNAME
    const password = process.env.BOOKING_AFFILIATE_PASSWORD
    if (!username || !password) {
      return { observations: [], api_calls: 0, errors: [] }
    }
    const auth = Buffer.from(`${username}:${password}`).toString('base64')

    const targets = await buildRateTargets({ horizonDays: 14 })
    const observations: Observation[] = []
    const errors: AdapterResult['errors'] = []
    let api_calls = 0

    for (const target of targets) {
      const eligible = target.competitors.filter((c) => c.external_booking_id)
      if (eligible.length === 0) continue

      for (const date of target.target_dates) {
        const checkout = nextDay(date)
        const body = {
          hotel_ids: eligible.map((c) => c.external_booking_id),
          checkin: date,
          checkout,
          currency: target.currency,
          // Limit response payload to what we need.
          extras: ['room_info', 'hotel_info'],
        }
        api_calls++
        try {
          const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: `Basic ${auth}`,
            },
            body: JSON.stringify(body),
          })
          if (!res.ok) {
            errors.push({
              message: `Booking ${target.property_id} ${date}: HTTP ${res.status}`,
            })
            continue
          }
          const data = (await res.json()) as BookingResponse
          for (const result of data.result ?? []) {
            const competitor = eligible.find(
              (c) => c.external_booking_id === String(result.hotel_id),
            )
            if (!competitor) continue
            const cleansed = cleanseRate(result, competitor, date, target.currency)
            if (cleansed) observations.push(cleansed)
          }
        } catch (err) {
          errors.push({
            message: `Booking ${target.property_id} ${date}: ${err instanceof Error ? err.message : err}`,
          })
        }
      }
    }

    return { observations, api_calls, errors }
  },
}

type BookingResponse = {
  result?: Array<{
    hotel_id: number | string
    available_rooms?: number
    blocks?: Array<{
      block_id?: string
      min_price?: { price?: number; currency?: string }
      max_price?: { price?: number; currency?: string }
      incremental_price?: Array<{ price?: number }>
      room_count?: number
    }>
  }>
}

function cleanseRate(
  result: NonNullable<BookingResponse['result']>[number],
  competitor: RateCompetitor,
  target_date: string,
  currency: string,
): Observation | null {
  const blocks = result.blocks ?? []
  if (blocks.length === 0 && (result.available_rooms ?? 0) <= 0) {
    // Property is sold out for this date.
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
  let rate_min: number | null = null
  let rate_max: number | null = null
  for (const block of blocks) {
    const lo = toFiniteNumber(block.min_price?.price)
    const hi = toFiniteNumber(block.max_price?.price)
    if (lo != null) rate_min = rate_min == null ? lo : Math.min(rate_min, lo)
    if (hi != null) rate_max = rate_max == null ? hi : Math.max(rate_max, hi)
  }
  const rooms_left_hint = typeof result.available_rooms === 'number' ? result.available_rooms : null
  const availability =
    rooms_left_hint == null
      ? 'unknown'
      : rooms_left_hint === 0
        ? 'sold_out'
        : rooms_left_hint <= 3
          ? 'limited'
          : 'available'

  return makeObservation({
    competitor,
    target_date,
    currency,
    rate_min,
    rate_max,
    availability,
    rooms_left_hint,
  })
}

type RatePayload = {
  competitor: RateCompetitor
  target_date: string
  currency: string
  rate_min: number | null
  rate_max: number | null
  availability: string
  rooms_left_hint: number | null
}

export function makeObservation(payload: RatePayload): Observation {
  return {
    observed_at: ensureIsoTimestamp(new Date().toISOString(), 'now'),
    target_kind: 'rate',
    target_key: `${payload.competitor.external_source ?? 'rate'}:${payload.competitor.id}:${payload.target_date}`,
    property_id: payload.competitor.property_id,
    org_id: payload.competitor.org_id,
    payload: {
      competitor_id: payload.competitor.id,
      competitor_name: sanitizeText(payload.competitor.name, 256),
      source: payload.competitor.external_source ?? 'unknown',
      scrape_date: new Date().toISOString().slice(0, 10),
      target_date: payload.target_date,
      currency: payload.currency,
      rate_min: payload.rate_min,
      rate_max: payload.rate_max,
      availability: payload.availability,
      rooms_left_hint: payload.rooms_left_hint,
      expires_at: expiresInOneDay(),
    },
  }
}

function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
