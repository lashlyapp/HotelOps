import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from './client'
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
  const [{ data: properties }, { data: subs }] = await Promise.all([
    admin.from('properties').select('id, slug, name').eq('org_id', orgId),
    admin
      .from('billing_subscriptions')
      .select('property_id, stripe_subscription_id')
      .eq('org_id', orgId),
  ])
  const propertyList = (properties ?? []) as Array<{
    id: string
    slug: string
    name: string
  }>
  const dbSubs = (subs ?? []) as Array<{
    property_id: string
    stripe_subscription_id: string | null
  }>

  // Fast path: every property already has a subscription row. We trust
  // the webhook to keep state fresh; a periodic deeper check could go
  // here later, but for now drift detection is just "did a property
  // never get a row at all?".
  const propertiesWithoutSub = propertyList.filter(
    (p) =>
      !dbSubs.some(
        (s) => s.property_id === p.id && s.stripe_subscription_id !== null,
      ),
  )
  if (propertiesWithoutSub.length === 0) return

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
    // (no fallback resolution next time around).
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
}
