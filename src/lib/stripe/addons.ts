import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BillingSubscription } from '@/lib/supabase/types'
import { ADDONS, type AddonKey } from './addon-config'
import { stripe } from './client'
import { requirePriceIdByLookupKey } from './prices'
import { syncSubscriptionToDb } from './subscriptions'

export type { AddonKey } from './addon-config'
export { ADDONS } from './addon-config'

/**
 * Org-level add-on management.
 *
 * Add-ons (signage_unlimited, guest_experience) are billed per property,
 * but the *activation decision* is org-level: turn it on once, every
 * property in the org gets the matching Stripe SubscriptionItem and the
 * matching line on their invoice. This prevents the loophole where an
 * operator could attach the add-on to a single property and use the
 * feature across the whole portfolio.
 *
 * Storage:
 *   - organizations.<addon>_addon_active     intent (source of truth)
 *   - billing_subscriptions.<addon>_active    mirrors the per-property
 *                                              SubscriptionItem state
 *                                              from Stripe via the webhook
 *
 * Flows:
 *   - addAddonToOrg      sets the flag, then attaches SubscriptionItems
 *                        to every property's subscription (idempotent
 *                        per (property, addon, op) so a double-click
 *                        can't double-bill)
 *   - removeAddonFromOrg clears the flag, then removes the items
 *   - reconciler         enforces the flag-to-items match across the org
 *                        (catches drift, new properties added mid-flight,
 *                        webhook misses)
 *   - new property       startSubscriptionForProperty / setup-checkout
 *                        consults the org flag and adds the Price as a
 *                        line item at subscription create time
 */

export type AddAddonResult = { ok: true } | { ok: false; error: string }

/**
 * Turn an add-on on for the whole org. Sets the intent flag, then
 * iterates every property's live subscription and attaches the matching
 * SubscriptionItem. Per-property failures are surfaced in the error
 * message but do not roll back the org flag — the reconciler will heal
 * any property that failed on the next pass.
 */
export async function addAddonToOrg(
  orgId: string,
  addonKey: AddonKey,
): Promise<AddAddonResult> {
  const config = ADDONS[addonKey]
  const admin = createAdminClient()
  const orgFlagColumn = orgFlagColumnFor(addonKey)

  const stripeClient = stripe()
  const priceId = await requirePriceIdByLookupKey(stripeClient, config.lookupKey)

  // Flip the org intent first. If we attach items first and then fail
  // to set the flag, the reconciler would later view the items as drift
  // and remove them — exactly the opposite of what the operator asked
  // for. Setting the flag first ensures every code path agrees on the
  // direction of truth.
  const flagSet = await admin
    .from('organizations')
    .update({ [orgFlagColumn]: true })
    .eq('id', orgId)
  if (flagSet.error) {
    return { ok: false, error: flagSet.error.message }
  }

  const { data: subs } = await admin
    .from('billing_subscriptions')
    .select('*')
    .eq('org_id', orgId)

  const failures: string[] = []
  for (const sub of (subs ?? []) as BillingSubscription[]) {
    if (!sub.stripe_subscription_id) continue
    if (sub[config.activeColumn]) continue
    if (['canceled', 'incomplete_expired'].includes(sub.status)) continue
    try {
      const item = await stripeClient.subscriptionItems.create(
        {
          subscription: sub.stripe_subscription_id,
          price: priceId,
          quantity: 1,
          // Invoice the prorated remainder of the current period NOW
          // (vs. rolling it into next month's renewal). Keeps each
          // property's invoice timeline clean — the customer sees an
          // immediate charge for what they just enabled, and next
          // month's renewal is one tidy full-period line item.
          proration_behavior: 'always_invoice',
        },
        {
          idempotencyKey: `addon:${sub.property_id}:${addonKey}:add`,
        },
      )
      await markPropertyAddonState(sub.property_id, addonKey, true, item.id)
    } catch (err) {
      failures.push(
        `${sub.property_id}: ${err instanceof Error ? err.message : 'add failed'}`,
      )
    }
  }

  if (failures.length > 0) {
    return {
      ok: false,
      error: `Add-on enabled but ${failures.length} property(ies) need a retry. The hourly reconciler will heal them automatically.`,
    }
  }
  return { ok: true }
}

/**
 * Turn an add-on off for the whole org. Clears the intent flag, then
 * removes the matching SubscriptionItem from every property's
 * subscription with proration.
 */
export async function removeAddonFromOrg(
  orgId: string,
  addonKey: AddonKey,
): Promise<AddAddonResult> {
  const config = ADDONS[addonKey]
  const admin = createAdminClient()
  const orgFlagColumn = orgFlagColumnFor(addonKey)

  const flagSet = await admin
    .from('organizations')
    .update({ [orgFlagColumn]: false })
    .eq('id', orgId)
  if (flagSet.error) {
    return { ok: false, error: flagSet.error.message }
  }

  const { data: subs } = await admin
    .from('billing_subscriptions')
    .select('*')
    .eq('org_id', orgId)

  const stripeClient = stripe()
  const failures: string[] = []
  for (const sub of (subs ?? []) as BillingSubscription[]) {
    const itemId = sub[config.itemIdColumn] as string | null
    if (!itemId) {
      // Local state thinks the item isn't there — make sure the columns
      // match (idempotent flip to false) and continue.
      await markPropertyAddonState(sub.property_id, addonKey, false, null)
      continue
    }
    try {
      await stripeClient.subscriptionItems.del(itemId, {
        proration_behavior: 'create_prorations',
      })
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code?: string }).code
          : undefined
      if (code !== 'resource_missing') {
        failures.push(
          `${sub.property_id}: ${err instanceof Error ? err.message : 'remove failed'}`,
        )
        continue
      }
    }
    await markPropertyAddonState(sub.property_id, addonKey, false, null)

    if (sub.stripe_subscription_id) {
      try {
        const fresh = await stripeClient.subscriptions.retrieve(
          sub.stripe_subscription_id,
        )
        await syncSubscriptionToDb(sub.property_id, sub.org_id, fresh)
      } catch {
        // Webhook will rectify.
      }
    }
  }

  if (failures.length > 0) {
    return {
      ok: false,
      error: `Add-on disabled but ${failures.length} property(ies) need a retry. The hourly reconciler will heal them automatically.`,
    }
  }
  return { ok: true }
}

/**
 * Pure helper: the column on `organizations` that holds the intent flag
 * for a given add-on. Centralized so callers don't hardcode column
 * names against the addon-config registry.
 */
export function orgFlagColumnFor(addonKey: AddonKey): string {
  switch (addonKey) {
    case 'signage_unlimited':
      return 'signage_unlimited_addon_active'
    case 'guest_experience':
      return 'guest_experience_addon_active'
  }
}

async function markPropertyAddonState(
  propertyId: string,
  addonKey: AddonKey,
  active: boolean,
  itemId: string | null,
) {
  const config = ADDONS[addonKey]
  const admin = createAdminClient()
  const update: Record<string, unknown> = {
    [config.activeColumn]: active,
    [config.itemIdColumn]: itemId,
    updated_at: new Date().toISOString(),
  }
  await admin
    .from('billing_subscriptions')
    .update(update)
    .eq('property_id', propertyId)
}

// extractAddonState lives in `addon-config.ts` to avoid a circular
// import (subscriptions.ts ↔ addons.ts). Re-export here for callers
// that already pull other helpers from this module.
export { extractAddonState } from './addon-config'
