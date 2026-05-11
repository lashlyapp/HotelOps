import type Stripe from 'stripe'

/**
 * Stable lookup keys for the Prices HotelOps bills with. The actual Price ids
 * (price_XXXX) live in Stripe and can change — to update pricing, create a
 * new Price in the Dashboard and transfer the lookup key onto it (Stripe
 * supports this on Price create with `transfer_lookup_key: true`). Existing
 * subscriptions stay on their grandfathered Price; new subscriptions pick up
 * the new one automatically.
 */
export const HOTELOPS_PRICE_LOOKUP_KEYS = {
  perPropertyMonthly: 'hotelops_per_property_monthly',
  setupFee: 'hotelops_setup_fee',
} as const

type CacheEntry = { id: string | null; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const TTL_MS = 5 * 60 * 1000

/**
 * Returns the active Price id for a given lookup key, or null if no active
 * Price has that key. Results are cached process-locally for 5 minutes so
 * we don't ping Stripe on every billing request — that's a short enough
 * window that a price update propagates quickly without manual cache busts.
 */
export async function resolvePriceIdByLookupKey(
  stripeClient: Stripe,
  lookupKey: string,
): Promise<string | null> {
  const now = Date.now()
  const cached = cache.get(lookupKey)
  if (cached && cached.expiresAt > now) return cached.id

  const prices = await stripeClient.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  })
  const id = prices.data[0]?.id ?? null
  cache.set(lookupKey, { id, expiresAt: now + TTL_MS })
  return id
}

export async function requirePriceIdByLookupKey(
  stripeClient: Stripe,
  lookupKey: string,
): Promise<string> {
  const id = await resolvePriceIdByLookupKey(stripeClient, lookupKey)
  if (!id) {
    throw new Error(
      `No active Stripe Price with lookup_key "${lookupKey}". Create a Price ` +
        `in the Stripe Dashboard and set its lookup key, or transfer the key ` +
        `onto a new Price (transfer_lookup_key=true).`,
    )
  }
  return id
}

/** Test/script affordance — clears the in-memory cache. */
export function _clearPriceCache(): void {
  cache.clear()
}
