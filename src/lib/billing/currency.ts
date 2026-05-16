/**
 * Currencies the platform CAN bill in (per the CHECK constraint on
 * organizations.currency). However, **v1 strategy is USD-only**: every
 * customer regardless of locale gets a USD Stripe Price. International
 * customers pay with any credit card from anywhere; their bank handles
 * the FX conversion at the standard rate, and Stripe Tax adds the
 * correct local VAT/GST/sales tax on top of the USD invoice.
 *
 * Why USD-only at this stage:
 *  - B2B SaaS norm: Linear, Vercel, Cal.com, GitHub, Webflow all do
 *    this. Customers in their target segment don't bounce on USD.
 *  - Boutique hotel owners are sophisticated B2B buyers — they're
 *    already paying their PMS, OTA settlements, and Stripe Connect
 *    in USD. USD invoicing is friction-free for them.
 *  - Maintaining 9+ currencies of Stripe Prices is premature for a
 *    company with single-digit customers. Each new currency = N more
 *    Stripe Prices to create, keep in sync on every price change,
 *    and reason about during pricing experiments.
 *
 * The other codes (eur, gbp, mxn, aud, jpy, krw, vnd, sgd) are kept
 * in SUPPORTED_CURRENCIES because the CHECK constraint already
 * accepts them and removing them is a destructive schema change.
 * They're dormant — no LOCALE_TO_CURRENCY mapping points at them
 * and no Stripe Prices exist with their `_<currency>` lookup keys.
 *
 * To activate a non-USD currency in the future (e.g. EUR after the
 * EU customer base hits ~10+):
 *  1. Add the locale → currency mapping in LOCALE_TO_CURRENCY.
 *  2. Create the Stripe Prices in the Dashboard with lookup keys
 *     `hotelops_*_<currency>` (currencyAwareLookupKey already
 *     handles the suffix on the read side).
 *  3. Update the marketing copy that currently says "billed in USD"
 *     to acknowledge the new currency option.
 */

export const SUPPORTED_CURRENCIES = [
  'usd',
  // The codes below are accepted by the DB constraint but dormant.
  // No LOCALE_TO_CURRENCY mapping points at them and no Stripe Prices
  // exist with the `_<currency>` lookup-key suffix. See the comment
  // block above for the activation procedure.
  'eur',
  'gbp',
  'mxn',
  'aud',
  'jpy',
  'krw',
  'vnd',
  'sgd',
] as const
export type Currency = (typeof SUPPORTED_CURRENCIES)[number]

export const DEFAULT_CURRENCY: Currency = 'usd'

/** Mapping from the marketing-site locale to the currency we default
 *  the org to at signup. Currently USD-only — every locale falls back
 *  to USD. See the strategy comment at the top of this file. */
const LOCALE_TO_CURRENCY: Record<string, Currency> = {
  en: 'usd',
  es: 'usd',
  fr: 'usd',
  ja: 'usd',
  ko: 'usd',
  vi: 'usd',
}

/** Resolve the default currency for a given locale. Falls back to
 *  USD for anything we don't recognize, including future locales we
 *  ship before adding them to this map. */
export function currencyForLocale(locale: string | null | undefined): Currency {
  if (!locale) return DEFAULT_CURRENCY
  return LOCALE_TO_CURRENCY[locale] ?? DEFAULT_CURRENCY
}

/** Lookup-key suffix convention. USD keeps the bare key for
 *  backwards compatibility; every other currency appends `_<code>`.
 *
 *   currencyAwareLookupKey('hotelops_per_property_monthly', 'usd')
 *     → 'hotelops_per_property_monthly'
 *   currencyAwareLookupKey('hotelops_per_property_monthly', 'eur')
 *     → 'hotelops_per_property_monthly_eur'
 */
export function currencyAwareLookupKey(
  baseKey: string,
  currency: Currency,
): string {
  if (currency === 'usd') return baseKey
  return `${baseKey}_${currency}`
}

/** ISO-4217 codes always uppercase in user-facing copy. */
export function formatCurrencyCode(currency: Currency): string {
  return currency.toUpperCase()
}

/** Format an integer-cents amount in the currency's natural format.
 *  Uses Intl.NumberFormat with the locale provided (defaults to
 *  'en') so prices read naturally for the visitor: $99.00, €99,00,
 *  £99.00, etc. */
export function formatMoney(
  cents: number,
  currency: Currency,
  locale = 'en',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}
