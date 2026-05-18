import type Stripe from 'stripe'
import {
  currencyAwareLookupKey,
  type Currency,
} from '@/lib/billing/currency'

/**
 * Stable lookup keys for the Prices HotelOps bills with. The actual Price ids
 * (price_XXXX) live in Stripe and can change — to update pricing, create a
 * new Price in the Dashboard and transfer the lookup key onto it (Stripe
 * supports this on Price create with `transfer_lookup_key: true`). Existing
 * subscriptions stay on their grandfathered Price; new subscriptions pick up
 * the new one automatically.
 *
 * Multi-currency: a non-USD org resolves a Price by appending the
 * lowercase currency code to the lookup key (see
 * {@link currencyAwareLookupKey} in src/lib/billing/currency.ts). USD
 * keeps the bare keys — no migration required for existing customers.
 * For each currency we launch, the operator creates a parallel set
 * of Stripe Prices with the suffixed lookup keys, e.g.
 * `hotelops_per_property_monthly_eur` at €99/month.
 */
export const HOTELOPS_PRICE_LOOKUP_KEYS = {
  // Base — $100 / property / month. Required for every active tenant.
  perPropertyMonthly: 'hotelops_per_property_monthly',
  // One-time onboarding-session fee. Only attached when the org opted
  // in at signup (organizations.wants_onboarding_session). Gated +
  // deduped in code — see shouldAttachOnboardingFee.
  setupFee: 'hotelops_setup_fee',
  // Add-on: unlimited signage screens beyond the 1 lobby screen
  // included in the base, plus video, web pages, and date/time-of-day
  // scheduling. $49 / property / month. See docs/pricing.md.
  signageUnlimitedMonthly: 'hotelops_signage_unlimited_monthly',
  // Per-screen overage charge for properties that don't take the
  // signage_unlimited add-on. $5 / screen / month beyond the 1 lobby
  // screen included in the base.
  signageOveragePerScreenMonthly:
    'hotelops_signage_overage_per_screen_monthly',
  // Add-on: arrival pages + printable QR + guest issue intake.
  // $39 / property / month. See docs/pricing.md.
  guestExperienceMonthly: 'hotelops_guest_experience_monthly',
  // Add-on: Social Studio — one AI-drafted daily post per property.
  // $19 / property / month. See docs/pricing.md.
  socialStudioMonthly: 'hotelops_social_studio_monthly',
  // Per-property storage overage. Quantity = number of 25 GB blocks
  // beyond the base 25 GB quota. $5 / block / property / month.
  storageBlock25GbMonthly: 'hotelops_storage_block_25gb_monthly',
} as const

export type PriceSnapshot = {
  id: string
  unitAmountCents: number | null
  currency: string
  interval: Stripe.Price.Recurring.Interval | null
}

type IdCacheEntry = { id: string | null; expiresAt: number }
type SnapshotCacheEntry = { snapshot: PriceSnapshot | null; expiresAt: number }
const cache = new Map<string, IdCacheEntry>()
const snapshotCache = new Map<string, SnapshotCacheEntry>()
const TTL_MS = 5 * 60 * 1000

/**
 * Returns the active Price id for a given lookup key, or null if no active
 * Price has that key. Results are cached process-locally for 5 minutes so
 * we don't ping Stripe on every billing request — that's a short enough
 * window that a price update propagates quickly without manual cache busts.
 *
 * Pass `currency` to resolve the per-currency Price. USD returns the
 * Price under the bare key (backwards compatible); other currencies
 * resolve under the suffixed key, e.g. `<base>_eur`. Callers that
 * don't pass a currency get the USD Price — same behavior as before
 * multi-currency landed.
 */
export async function resolvePriceIdByLookupKey(
  stripeClient: Stripe,
  lookupKey: string,
  currency?: Currency,
): Promise<string | null> {
  const effectiveKey = currency
    ? currencyAwareLookupKey(lookupKey, currency)
    : lookupKey
  const now = Date.now()
  const cached = cache.get(effectiveKey)
  if (cached && cached.expiresAt > now) return cached.id

  const prices = await stripeClient.prices.list({
    lookup_keys: [effectiveKey],
    active: true,
    limit: 1,
  })
  const id = prices.data[0]?.id ?? null
  cache.set(effectiveKey, { id, expiresAt: now + TTL_MS })
  return id
}

export async function requirePriceIdByLookupKey(
  stripeClient: Stripe,
  lookupKey: string,
  currency?: Currency,
): Promise<string> {
  const id = await resolvePriceIdByLookupKey(stripeClient, lookupKey, currency)
  if (!id) {
    const effectiveKey = currency
      ? currencyAwareLookupKey(lookupKey, currency)
      : lookupKey
    throw new Error(
      `No active Stripe Price with lookup_key "${effectiveKey}". Create a Price ` +
        `in the Stripe Dashboard and set its lookup key, or transfer the key ` +
        `onto a new Price (transfer_lookup_key=true). For non-USD currencies, ` +
        `the lookup key must be suffixed with the lowercase ISO code (e.g. ` +
        `<base>_eur).`,
    )
  }
  return id
}

/**
 * Resolve the full Price object (id + unit_amount + currency) for a
 * lookup key. Used by the marketing/UI copy on /billing and /properties
 * so the displayed amounts always match what Stripe will actually
 * charge — no more hardcoded "$100 / month" strings going stale when
 * pricing changes. Cached process-locally for the same TTL as the id
 * resolver.
 */
export async function resolvePriceSnapshotByLookupKey(
  stripeClient: Stripe,
  lookupKey: string,
  currency?: Currency,
): Promise<PriceSnapshot | null> {
  const effectiveKey = currency
    ? currencyAwareLookupKey(lookupKey, currency)
    : lookupKey
  const now = Date.now()
  const cached = snapshotCache.get(effectiveKey)
  if (cached && cached.expiresAt > now) return cached.snapshot

  const prices = await stripeClient.prices.list({
    lookup_keys: [effectiveKey],
    active: true,
    limit: 1,
  })
  const price = prices.data[0]
  const snapshot: PriceSnapshot | null = price
    ? {
        id: price.id,
        unitAmountCents: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval ?? null,
      }
    : null
  snapshotCache.set(effectiveKey, { snapshot, expiresAt: now + TTL_MS })
  cache.set(effectiveKey, { id: snapshot?.id ?? null, expiresAt: now + TTL_MS })
  return snapshot
}

/** Test/script affordance — clears the in-memory cache. */
export function _clearPriceCache(): void {
  cache.clear()
  snapshotCache.clear()
}
