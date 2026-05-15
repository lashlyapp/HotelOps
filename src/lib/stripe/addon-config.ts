import type Stripe from 'stripe'
import { HOTELOPS_PRICE_LOOKUP_KEYS } from './prices'

/**
 * Add-on registry. Lives in its own module so both `subscriptions.ts`
 * (which mirrors add-on state from the webhook) and `addons.ts` (which
 * adds/removes the items via Stripe) can import without forming a
 * circular dependency.
 */
export const ADDONS = {
  signage_unlimited: {
    lookupKey: HOTELOPS_PRICE_LOOKUP_KEYS.signageUnlimitedMonthly,
    activeColumn: 'signage_unlimited_active' as const,
    itemIdColumn: 'signage_unlimited_item_id' as const,
    label: 'Signage Unlimited',
  },
  guest_experience: {
    lookupKey: HOTELOPS_PRICE_LOOKUP_KEYS.guestExperienceMonthly,
    activeColumn: 'guest_experience_active' as const,
    itemIdColumn: 'guest_experience_item_id' as const,
    label: 'Guest Experience',
  },
} as const

export type AddonKey = keyof typeof ADDONS

/**
 * Inspect a Stripe Subscription's items and return which of our known
 * add-ons are currently present. `Price.lookup_key` is expanded on
 * `subscription.items` by default, so this is a pure synchronous loop.
 */
export function extractAddonState(
  subscription: Stripe.Subscription,
): Record<AddonKey, { active: boolean; itemId: string | null }> {
  const result: Record<AddonKey, { active: boolean; itemId: string | null }> = {
    signage_unlimited: { active: false, itemId: null },
    guest_experience: { active: false, itemId: null },
  }
  for (const item of subscription.items.data) {
    const lookupKey = item.price?.lookup_key
    if (!lookupKey) continue
    for (const [key, config] of Object.entries(ADDONS) as Array<
      [AddonKey, (typeof ADDONS)[AddonKey]]
    >) {
      if (lookupKey === config.lookupKey) {
        result[key] = { active: true, itemId: item.id }
      }
    }
  }
  return result
}
