import type { Adapter, AdapterContext, AdapterResult, Observation } from './types'
import { buildCityKey, ensureIsoTimestamp, sanitizeText, slugify } from './cleansing'

// NWS (US National Weather Service) — free, no key.
// https://www.weather.gov/documentation/services-web-api
//
// We query active alerts per US state. Non-US properties contribute
// nothing and the adapter short-circuits.

const BASE = 'https://api.weather.gov/alerts/active'

type NwsAlert = {
  id: string
  properties: {
    id?: string
    event?: string
    severity?: string
    headline?: string
    description?: string
    effective?: string
    expires?: string
    sent?: string
    areaDesc?: string
    senderName?: string
  }
}

type NwsResponse = { features?: NwsAlert[] }

export const nwsAlertsAdapter: Adapter = {
  source: 'nws_alerts',
  async run(ctx: AdapterContext): Promise<AdapterResult> {
    const states = uniqueUsStates(ctx.properties)
    if (states.length === 0) {
      return { observations: [], api_calls: 0, errors: [] }
    }
    const observations: Observation[] = []
    const errors: AdapterResult['errors'] = []
    let api_calls = 0

    for (const state of states) {
      api_calls++
      try {
        const res = await fetch(`${BASE}?area=${state}`, {
          headers: {
            Accept: 'application/geo+json',
            'User-Agent': 'MyHotelOps/1.0 (https://myhotelops.com, ops@myhotelops.com)',
          },
        })
        if (!res.ok) {
          errors.push({ message: `NWS ${state}: HTTP ${res.status}` })
          continue
        }
        const data = (await res.json()) as NwsResponse
        for (const alert of data.features ?? []) {
          const cleansed = cleanseAlert(alert, state)
          if (cleansed) observations.push(cleansed)
        }
      } catch (err) {
        errors.push({ message: `NWS ${state}: ${err instanceof Error ? err.message : err}` })
      }
    }

    return { observations, api_calls, errors }
  },
}

function uniqueUsStates(properties: AdapterContext['properties']): string[] {
  const set = new Set<string>()
  for (const p of properties) {
    if ((p.country ?? '').toUpperCase() !== 'US') continue
    if (!p.state) continue
    const code = p.state.toUpperCase().trim()
    if (code.length === 2) set.add(code)
  }
  return [...set]
}

function cleanseAlert(alert: NwsAlert, state: string): Observation | null {
  const props = alert.properties ?? {}
  const external_id = props.id || alert.id
  const headline = sanitizeText(props.headline ?? props.event ?? '', 512)
  if (!external_id || !headline) return null

  // areaDesc is a semicolon-separated city/county list; pick the
  // first for a minimum-viable geo_key. Better matching happens in
  // the signal builder.
  const firstArea = (props.areaDesc ?? '').split(';')[0]?.trim() ?? null
  const geo_key = firstArea
    ? buildCityKey({ city: firstArea, state, country: 'US' })
    : `state:US-${state}`

  return {
    observed_at: ensureIsoTimestamp(props.sent ?? new Date().toISOString(), 'sent'),
    target_kind: 'disruption',
    target_key: `nws:${external_id}`,
    geo_key,
    payload: {
      external_id,
      kind: mapEventToKind(props.event ?? ''),
      severity: (props.severity ?? 'medium').toLowerCase(),
      headline,
      description: sanitizeText(props.description ?? '', 2048),
      effective_at: props.effective ?? null,
      ends_at: props.expires ?? null,
      area: sanitizeText(props.areaDesc ?? '', 512),
      sender: sanitizeText(props.senderName ?? '', 128),
      state_code: state,
      slug: slugify(props.event ?? 'alert'),
    },
    payload_raw: alert as unknown as Record<string, unknown>,
  }
}

function mapEventToKind(event: string): string {
  const e = event.toLowerCase()
  if (e.includes('storm') || e.includes('tornado') || e.includes('hurricane')) return 'storm'
  if (e.includes('flood')) return 'storm'
  if (e.includes('heat')) return 'heatwave'
  if (e.includes('cold') || e.includes('wind chill')) return 'cold_snap'
  if (e.includes('fire') || e.includes('smoke')) return 'wildfire_smoke'
  if (e.includes('air quality')) return 'air_quality'
  return 'closure'
}
