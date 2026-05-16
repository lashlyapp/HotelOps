/**
 * Currencies the platform bills in. The list lives in sync with the
 * CHECK constraint on organizations.currency (see migration
 * 20260515020000_org_currency.sql) — to launch a new market, add the
 * code in BOTH places in the same PR.
 *
 * The full per-currency rollout requires creating Stripe Prices with
 * lookup keys suffixed by the currency (e.g.
 * `hotelops_per_property_monthly_eur`). USD keeps the bare key
 * (`hotelops_per_property_monthly`) so existing US customers don't
 * need any Price migration when we add a new currency.
 */

export const SUPPORTED_CURRENCIES = ['usd', 'eur', 'gbp', 'mxn', 'aud'] as const
export type Currency = (typeof SUPPORTED_CURRENCIES)[number]

export const DEFAULT_CURRENCY: Currency = 'usd'

/** Mapping from the marketing-site locale to the currency we default
 *  the org to at signup. Conservative defaults — the operator can
 *  override later via a customer-success workflow if a Spanish-
 *  speaking customer wants to be billed in USD or vice versa. */
const LOCALE_TO_CURRENCY: Record<string, Currency> = {
  en: 'usd',
  es: 'eur',
  fr: 'eur',
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
