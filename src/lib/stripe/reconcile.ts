import 'server-only'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { ADDONS, extractAddonState, type AddonKey } from './addon-config'
import { stripe } from './client'
import { requirePriceIdByLookupKey } from './prices'
import { syncSubscriptionToDb } from './subscriptions'

/**
 * Silent reconciler. Walks the org's Stripe Customer's subscriptions and
 * re-mirrors any that the DB is missing (or that drifted from Stripe).
 * Called opportunistically on /billing page render so a missed webhook,
 * a migration-deploy race, or a downstream Stripe event the operator
 * never saw can't leave a property stuck in "Not Started".
 *
 * Cheap by default — bails out before the Stripe API call if the DB
 * already has a billing_subscriptions row for every property in the org.
 * That's the common case once everything's healthy; full reconciliation
 * only runs when drift is detected.
 *
 * Idempotent and best-effort. Failures are logged, never thrown — the
 * page render must succeed regardless of Stripe's mood.
 */
export async function reconcileOrgSubscriptions(
  orgId: string,
  customerId: string | null,
): Promise<void> {
  if (!customerId) return

  const admin = createAdminClient()
  const [{ data: properties }, { data: subs }, { data: org }] =
    await Promise.all([
      admin.from('properties').select('id, slug, name').eq('org_id', orgId),
      admin
        .from('billing_subscriptions')
        .select(
          'property_id, stripe_subscription_id, signage_unlimited_active, signage_unlimited_item_id, guest_experience_active, guest_experience_item_id',
        )
        .eq('org_id', orgId),
      admin
        .from('organizations')
        .select(
          'signage_unlimited_addon_active, guest_experience_addon_active',
        )
        .eq('id', orgId)
        .maybeSingle(),
    ])
  const propertyList = (properties ?? []) as Array<{
    id: string
    slug: string
    name: string
  }>
  const dbSubs = (subs ?? []) as Array<{
    property_id: string
    stripe_subscription_id: string | null
    signage_unlimited_active: boolean
    signage_unlimited_item_id: string | null
    guest_experience_active: boolean
    guest_experience_item_id: string | null
  }>

  // Fast path: every property has a synced subscription AND every
  // property's per-addon state matches the org's intent flags. In the
  // steady state this is a few index lookups and zero Stripe calls.
  const propertiesWithoutSub = propertyList.filter(
    (p) =>
      !dbSubs.some(
        (s) => s.property_id === p.id && s.stripe_subscription_id !== null,
      ),
  )
  const addonDriftPresent = org
    ? dbSubs.some((s) => {
        if (s.stripe_subscription_id === null) return false
        if (
          (org.signage_unlimited_addon_active ?? false) !==
          s.signage_unlimited_active
        ) {
          return true
        }
        if (
          (org.guest_experience_addon_active ?? false) !==
          s.guest_experience_active
        ) {
          return true
        }
        return false
      })
    : false

  if (propertiesWithoutSub.length === 0 && !addonDriftPresent) return

  const propertyIds = new Set(propertyList.map((p) => p.id))
  const propertyBySlug = new Map(propertyList.map((p) => [p.slug, p]))
  const propertyByLowerName = new Map(
    propertyList.map((p) => [p.name.toLowerCase(), p]),
  )

  // Pull every Stripe subscription for the customer in one call. Page
  // ceiling of 100 is well past any realistic per-org count; if a chain
  // ever has more, paginate.
  const stripeClient = stripe()
  let stripeSubs: Awaited<
    ReturnType<typeof stripeClient.subscriptions.list>
  >['data']
  try {
    const list = await stripeClient.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
    })
    stripeSubs = list.data
  } catch (err) {
    console.warn(
      '[billing] reconcile: stripe.subscriptions.list failed',
      orgId,
      err instanceof Error ? err.message : err,
    )
    return
  }

  for (const sub of stripeSubs) {
    const propertyIdFromMeta =
      (sub.metadata?.property_id as string | undefined) ?? null
    const propertySlugFromMeta =
      (sub.metadata?.property_slug as string | undefined) ?? null
    const orgIdFromMeta =
      (sub.metadata?.org_id as string | undefined) ?? null
    if (orgIdFromMeta && orgIdFromMeta !== orgId) continue

    // Resolution order matches the user-initiated resync action: metadata
    // first (cheap, authoritative when present), then slug, then a
    // description-based fuzzy match. This is intentionally tolerant —
    // a missing or stale metadata.property_id is exactly the kind of
    // drift this reconciler exists to absorb.
    let resolved =
      propertyIdFromMeta && propertyIds.has(propertyIdFromMeta)
        ? propertyList.find((p) => p.id === propertyIdFromMeta) ?? null
        : null
    if (!resolved && propertySlugFromMeta) {
      resolved = propertyBySlug.get(propertySlugFromMeta) ?? null
    }
    if (!resolved && sub.description?.startsWith('HotelOps subscription — ')) {
      const name = sub.description
        .slice('HotelOps subscription — '.length)
        .trim()
        .toLowerCase()
      resolved = propertyByLowerName.get(name) ?? null
    }
    if (!resolved) continue

    // Heal the Stripe metadata so future webhook events route directly
    // (no fallback resolution next time around). Also mutate the
    // in-memory `sub` so the second-pass addon enforcement loop below
    // can rely on metadata.property_id without re-listing.
    if (!propertyIdFromMeta || propertyIdFromMeta !== resolved.id) {
      try {
        await stripeClient.subscriptions.update(sub.id, {
          metadata: {
            ...sub.metadata,
            property_id: resolved.id,
            property_slug: resolved.slug,
            org_id: orgId,
            app: 'hotelops',
          },
        })
        sub.metadata = {
          ...(sub.metadata ?? {}),
          property_id: resolved.id,
          property_slug: resolved.slug,
          org_id: orgId,
          app: 'hotelops',
        }
      } catch (err) {
        console.warn(
          '[billing] reconcile: metadata heal failed',
          sub.id,
          err instanceof Error ? err.message : err,
        )
      }
    }

    try {
      await syncSubscriptionToDb(resolved.id, orgId, sub)
    } catch (err) {
      console.warn(
        '[billing] reconcile: syncSubscriptionToDb failed',
        sub.id,
        resolved.id,
        err instanceof Error ? err.message : err,
      )
    }
  }

  // Second pass: enforce the org-level add-on intent across every
  // property's subscription. For each (sub, addon), the cases are:
  //   want = true,  have = true   → no-op
  //   want = false, have = false  → no-op
  //   want = true,  have = false  → create the SubscriptionItem
  //   want = false, have = true   → delete the SubscriptionItem
  // This is what makes "Signage Unlimited" feel like one global toggle
  // even when a property is added a week after the org turned it on.
  if (!org) return
  const want: Record<AddonKey, boolean> = {
    signage_unlimited: org.signage_unlimited_addon_active ?? false,
    guest_experience: org.guest_experience_addon_active ?? false,
  }

  const addonPriceIds = new Map<AddonKey, string>()

  for (const sub of stripeSubs) {
    if (
      sub.status === 'canceled' ||
      sub.status === 'incomplete_expired'
    ) {
      continue
    }
    const propertyIdFromMeta =
      (sub.metadata?.property_id as string | undefined) ?? null
    if (!propertyIdFromMeta || !propertyIds.has(propertyIdFromMeta)) {
      continue
    }
    const have = extractAddonState(sub)

    for (const key of ['signage_unlimited', 'guest_experience'] as AddonKey[]) {
      const wanted = want[key]
      const present = have[key].active
      if (wanted === present) continue

      try {
        if (wanted) {
          // Need to add. Resolve the Price id on first miss; cache for
          // the rest of the loop so an org with 50 properties doesn't
          // call resolvePriceIdByLookupKey 50 times.
          let priceId = addonPriceIds.get(key)
          if (!priceId) {
            priceId = await requirePriceIdByLookupKey(
              stripeClient,
              ADDONS[key].lookupKey,
            )
            addonPriceIds.set(key, priceId)
          }
          await stripeClient.subscriptionItems.create(
            {
              subscription: sub.id,
              price: priceId,
              quantity: 1,
              proration_behavior: 'create_prorations',
            },
            {
              idempotencyKey: `reconcile:${propertyIdFromMeta}:${key}:add`,
            },
          )
        } else {
          // Need to remove. Stripe expects the SubscriptionItem id, not
          // the Price id; pull it out of the current items list.
          const item = sub.items.data.find(
            (i: Stripe.SubscriptionItem) =>
              i.price?.lookup_key === ADDONS[key].lookupKey,
          )
          if (!item) continue
          await stripeClient.subscriptionItems.del(item.id, {
            proration_behavior: 'create_prorations',
          })
        }

        // Re-sync this single subscription so the local mirror matches
        // the new item set without waiting for the webhook.
        const fresh = await stripeClient.subscriptions.retrieve(sub.id)
        await syncSubscriptionToDb(propertyIdFromMeta, orgId, fresh)
      } catch (err) {
        console.warn(
          '[billing] reconcile: addon enforcement failed',
          sub.id,
          key,
          wanted ? 'add' : 'remove',
          err instanceof Error ? err.message : err,
        )
      }
    }
  }
}
