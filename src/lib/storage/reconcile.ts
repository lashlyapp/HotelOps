import 'server-only'
import type Stripe from 'stripe'
import {
  HOTELOPS_PRICE_LOOKUP_KEYS,
  requirePriceIdByLookupKey,
} from '@/lib/stripe/prices'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeStorageBlocks } from './usage'

/**
 * Make Stripe's storage-overage SubscriptionItem quantity match the
 * blocks implied by the property's current storage_used_bytes. Three
 * cases:
 *
 *   wantedBlocks = 0, item exists  → delete the item
 *   wantedBlocks > 0, no item      → create it with that quantity
 *   wantedBlocks > 0, item exists  → update quantity (no-op if equal)
 *
 * Proration is `create_prorations`, not `always_invoice`: storage is a
 * metered concept and our cron updates it asynchronously, so it should
 * roll into the next regular invoice as a usage adjustment rather than
 * triggering an immediate charge every time a video gets uploaded.
 *
 * Idempotent. Safe to call from the nightly cron, the billing-page
 * load, and the post-login hook concurrently.
 */
export async function reconcileStorageForProperty(args: {
  propertyId: string
  usedBytes: number
}): Promise<void> {
  const admin = createAdminClient()
  const { data: sub } = await admin
    .from('billing_subscriptions')
    .select('*')
    .eq('property_id', args.propertyId)
    .maybeSingle()
  // No subscription yet → no Stripe item to touch. The /billing page
  // will pick this up once the property is subscribed.
  if (!sub || !sub.stripe_subscription_id) return

  const { data: property } = await admin
    .from('properties')
    .select('storage_quota_bytes')
    .eq('id', args.propertyId)
    .maybeSingle()
  if (!property) return

  const wantedBlocks = computeStorageBlocks({
    usedBytes: args.usedBytes,
    quotaBytes: property.storage_quota_bytes,
  })
  const currentBlocks = sub.storage_blocks_quantity ?? 0
  const currentItemId = sub.storage_blocks_item_id as string | null
  if (wantedBlocks === currentBlocks && (currentItemId !== null) === (wantedBlocks > 0)) {
    // Already in sync. Both DB and Stripe agree.
    return
  }

  const stripeClient = stripe()

  if (wantedBlocks === 0) {
    // Customer dropped below the quota — remove the item entirely.
    if (currentItemId) {
      try {
        await stripeClient.subscriptionItems.del(currentItemId, {
          proration_behavior: 'create_prorations',
        })
      } catch (err) {
        const code =
          err && typeof err === 'object' && 'code' in err
            ? (err as { code?: string }).code
            : undefined
        if (code !== 'resource_missing') throw err
      }
    }
    await admin
      .from('billing_subscriptions')
      .update({
        storage_blocks_quantity: 0,
        storage_blocks_item_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('property_id', args.propertyId)
    return
  }

  if (!currentItemId) {
    // Need to create. Resolve the Price on demand — cached per process.
    const priceId = await requirePriceIdByLookupKey(
      stripeClient,
      HOTELOPS_PRICE_LOOKUP_KEYS.storageBlock25GbMonthly,
    )
    let created: Stripe.SubscriptionItem
    try {
      created = await stripeClient.subscriptionItems.create(
        {
          subscription: sub.stripe_subscription_id,
          price: priceId,
          quantity: wantedBlocks,
          // Storage drift is usage-driven, not customer-initiated.
          // Roll the prorated impact into the next regular invoice
          // rather than triggering one immediately.
          proration_behavior: 'create_prorations',
        },
        {
          idempotencyKey: `storage:${args.propertyId}:${wantedBlocks}:create`,
        },
      )
    } catch (err) {
      console.warn(
        '[storage] reconcile: create item failed',
        args.propertyId,
        err instanceof Error ? err.message : err,
      )
      return
    }
    await admin
      .from('billing_subscriptions')
      .update({
        storage_blocks_quantity: wantedBlocks,
        storage_blocks_item_id: created.id,
        updated_at: new Date().toISOString(),
      })
      .eq('property_id', args.propertyId)
    return
  }

  // Existing item, quantity changed. Update in place.
  try {
    await stripeClient.subscriptionItems.update(currentItemId, {
      quantity: wantedBlocks,
      proration_behavior: 'create_prorations',
    })
  } catch (err) {
    console.warn(
      '[storage] reconcile: update item failed',
      args.propertyId,
      err instanceof Error ? err.message : err,
    )
    return
  }
  await admin
    .from('billing_subscriptions')
    .update({
      storage_blocks_quantity: wantedBlocks,
      updated_at: new Date().toISOString(),
    })
    .eq('property_id', args.propertyId)
}
