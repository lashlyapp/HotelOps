import 'server-only'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BillingSubscription } from '@/lib/supabase/types'
import { ADDONS, type AddonKey } from './addon-config'
import { stripe } from './client'
import { requirePriceIdByLookupKey } from './prices'
import { syncSubscriptionToDb } from './subscriptions'

export type { AddonKey } from './addon-config'
export { ADDONS } from './addon-config'

/**
 * Add-on management for a per-property subscription. Add-ons are extra
 * Stripe SubscriptionItems hung off the same Subscription that carries
 * the base $100/property/month item; the bill is one combined invoice.
 *
 * The local mirror columns on billing_subscriptions
 * (`*_active`, `*_item_id`) are set both here (best-effort, so the UI
 * updates immediately) and by the customer.subscription.updated webhook
 * (authoritative, since Stripe's events are the canonical source).
 */

export type AddAddonResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Add an add-on Price as a new SubscriptionItem on the property's
 * subscription. No-ops (returns ok) if the add-on is already active —
 * the operator double-tapped the toggle and we don't want to bill twice.
 *
 * Prorates by default (Stripe's `create_prorations`) so a mid-cycle add
 * shows up on the next invoice as a partial-period charge.
 */
export async function addAddonToProperty(
  propertyId: string,
  addonKey: AddonKey,
): Promise<AddAddonResult> {
  const config = ADDONS[addonKey]
  const sub = await loadSubscription(propertyId)
  if (!sub) return { ok: false, error: 'No active subscription for this property.' }
  if (!sub.stripe_subscription_id) {
    return { ok: false, error: 'Subscription is not yet linked to Stripe.' }
  }
  if (sub[config.activeColumn]) return { ok: true }

  const stripeClient = stripe()
  const priceId = await requirePriceIdByLookupKey(stripeClient, config.lookupKey)

  let item: Stripe.SubscriptionItem
  try {
    item = await stripeClient.subscriptionItems.create(
      {
        subscription: sub.stripe_subscription_id,
        price: priceId,
        quantity: 1,
        proration_behavior: 'create_prorations',
      },
      {
        // Same property double-clicking the toggle within a few seconds
        // must not create two duplicate items billing the same Price.
        idempotencyKey: `addon:${propertyId}:${addonKey}:add`,
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe add failed'
    return { ok: false, error: message }
  }

  // Eagerly mirror the new item into the DB. The webhook will fire a
  // customer.subscription.updated almost immediately and re-confirm
  // this — that's the authoritative write — but reflecting locally keeps
  // the UI snappy and prevents the toggle from flickering "off" after a
  // successful click.
  await markAddonState(propertyId, addonKey, true, item.id)
  return { ok: true }
}

/**
 * Remove the add-on SubscriptionItem from the property's subscription.
 * Returns ok if the add-on isn't currently active.
 */
export async function removeAddonFromProperty(
  propertyId: string,
  addonKey: AddonKey,
): Promise<AddAddonResult> {
  const config = ADDONS[addonKey]
  const sub = await loadSubscription(propertyId)
  if (!sub) return { ok: false, error: 'No active subscription for this property.' }
  if (!sub[config.activeColumn]) return { ok: true }
  const itemId = sub[config.itemIdColumn] as string | null
  if (!itemId) {
    // Local state is stale — clear the flag so the UI matches Stripe
    // on the next render. The webhook will eventually rectify.
    await markAddonState(propertyId, addonKey, false, null)
    return { ok: true }
  }

  try {
    await stripe().subscriptionItems.del(itemId, {
      // Prorate the credit back to the customer for the unused portion
      // of the period they already paid for.
      proration_behavior: 'create_prorations',
    })
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as { code?: string }).code
        : undefined
    // "No such subscription_item" means Stripe lost it (likely already
    // removed) — fall through and clear our column.
    if (code !== 'resource_missing') {
      const message = err instanceof Error ? err.message : 'Stripe remove failed'
      return { ok: false, error: message }
    }
  }

  await markAddonState(propertyId, addonKey, false, null)

  // Re-sync from Stripe so the local row reflects the new item set and
  // any proration adjustments. Best-effort — the webhook will catch up.
  try {
    const fresh = await stripe().subscriptions.retrieve(
      sub.stripe_subscription_id!,
    )
    await syncSubscriptionToDb(propertyId, sub.org_id, fresh)
  } catch {
    // ignore; webhook is the safety net.
  }
  return { ok: true }
}

async function loadSubscription(
  propertyId: string,
): Promise<BillingSubscription | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('billing_subscriptions')
    .select('*')
    .eq('property_id', propertyId)
    .maybeSingle()
  return (data as BillingSubscription | null) ?? null
}

async function markAddonState(
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
