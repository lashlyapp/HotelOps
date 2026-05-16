import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  currencyAwareLookupKey,
  currencyForLocale,
  DEFAULT_CURRENCY,
  formatMoney,
  SUPPORTED_CURRENCIES,
} from './currency'

describe('currencyForLocale', () => {
  // v1 strategy is USD-only: every supported locale maps to USD.
  // See the comment block at the top of currency.ts for the rationale
  // and the procedure for activating non-USD currencies later.
  it('maps every supported locale to USD', () => {
    for (const locale of ['en', 'es', 'fr', 'ja', 'ko', 'vi']) {
      assert.equal(
        currencyForLocale(locale),
        'usd',
        `expected ${locale} → usd (USD-only v1)`,
      )
    }
  })

  it('falls back to USD for unknown / missing locales', () => {
    assert.equal(currencyForLocale('de'), DEFAULT_CURRENCY)
    assert.equal(currencyForLocale(null), DEFAULT_CURRENCY)
    assert.equal(currencyForLocale(undefined), DEFAULT_CURRENCY)
    assert.equal(currencyForLocale(''), DEFAULT_CURRENCY)
  })
})

describe('currencyAwareLookupKey', () => {
  it('returns the bare key for USD (backwards compatible)', () => {
    assert.equal(
      currencyAwareLookupKey('hotelops_per_property_monthly', 'usd'),
      'hotelops_per_property_monthly',
    )
  })

  it('suffixes the currency for non-USD', () => {
    assert.equal(
      currencyAwareLookupKey('hotelops_per_property_monthly', 'eur'),
      'hotelops_per_property_monthly_eur',
    )
    assert.equal(
      currencyAwareLookupKey('hotelops_per_property_monthly', 'gbp'),
      'hotelops_per_property_monthly_gbp',
    )
  })

  it('produces a unique key per supported currency', () => {
    const seen = new Set<string>()
    for (const c of SUPPORTED_CURRENCIES) {
      const k = currencyAwareLookupKey('hotelops_x', c)
      assert.equal(seen.has(k), false, `Duplicate key for ${c}: ${k}`)
      seen.add(k)
    }
  })
})

describe('formatMoney', () => {
  it('formats USD in the en locale', () => {
    // Intl.NumberFormat with 'en' as locale defaults to en-US-style
    // formatting; assert structure (currency symbol + amount) rather
    // than exact whitespace which can differ across ICU versions.
    const s = formatMoney(10000, 'usd', 'en')
    assert.match(s, /\$100/)
  })

  it('formats EUR with a European locale', () => {
    const s = formatMoney(10000, 'eur', 'fr')
    assert.match(s, /100/)
    assert.match(s, /€/)
  })
})
