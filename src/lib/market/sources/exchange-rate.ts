import type { Adapter, AdapterResult, Observation } from './types'
import { ensureIsoTimestamp } from './cleansing'

// exchange-rate.host — free, no API key.
// Returns daily FX rates against a base currency.
// https://exchangerate.host/

const BASE = 'https://api.exchangerate.host/latest'

type ExchangeResponse = {
  base?: string
  date?: string
  rates?: Record<string, number>
}

// Inbound source markets we care about for boutique hotels.
const TRACKED_CURRENCIES = ['EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'MXN', 'KRW']

export const exchangeRateAdapter: Adapter = {
  source: 'exchange_rate_host',
  async run(): Promise<AdapterResult> {
    const errors: AdapterResult['errors'] = []
    let api_calls = 0

    // v1: USD base only. International orgs can add more bases later
    // by parameterizing this loop on org currencies.
    const base = 'USD'
    const params = new URLSearchParams({
      base,
      symbols: TRACKED_CURRENCIES.join(','),
    })
    api_calls++
    try {
      const res = await fetch(`${BASE}?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        errors.push({ message: `exchange-rate.host HTTP ${res.status}` })
        return { observations: [], api_calls, errors }
      }
      const data = (await res.json()) as ExchangeResponse
      if (!data.rates) {
        errors.push({ message: 'exchange-rate.host: missing rates' })
        return { observations: [], api_calls, errors }
      }
      const observed_at = ensureIsoTimestamp(new Date().toISOString(), 'now')
      const obs: Observation = {
        observed_at,
        target_kind: 'fx',
        target_key: `fx:${base}:${data.date ?? observed_at.slice(0, 10)}`,
        payload: {
          base_currency: base,
          measurement_date: data.date ?? observed_at.slice(0, 10),
          rates: data.rates,
          source: 'exchange_rate_host',
        },
        payload_raw: data as unknown as Record<string, unknown>,
      }
      return { observations: [obs], api_calls, errors }
    } catch (err) {
      errors.push({
        message: `exchange-rate.host: ${err instanceof Error ? err.message : err}`,
      })
      return { observations: [], api_calls, errors }
    }
  },
}
