import 'server-only'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from './client'
import {
  HOTELOPS_PRICE_LOOKUP_KEYS,
  requirePriceIdByLookupKey,
  resolvePriceIdByLookupKey,
} from './prices'
import { propertyHasBeenSubscribed } from './subscriptions'

export type StartSubscriptionOptions = {
  priceId?: string
  /** Override the setup-fee Price id (otherwise resolved from the
   *  hotelops_setup_fee lookup key). The fee is only charged when this
   *  property has no prior subscription history — a resubscribe after
   *  cancellation is NOT a new property. */
  setupFeePriceId?: string
  graceDays?: number
  /** Suppress the setup fee for this specific call even if a Price is
   *  configured. Useful for ops/migration scripts that re-create a sub
   *  for a property that's already paid setup historically. */
  skipSetupFee?: boolean
}

export type StartSubscriptionForPropertyResult =
  | {
      kind: 'created'
      orgId: string
      propertyId: string
      stripeCustomerId: string
      stripeSubscriptionId: string
      status: Stripe.Subscription.Status
      priceId: string
      setupFeePriceId: string | null
      paymentMethodDueAt: Date
    }
  | {
      kind: 'existing'
      orgId: string
      propertyId: string
      stripeCustomerId: string
      stripeSubscriptionId: string
    }

export type StartSubscriptionForOrgResult = {
  orgId: string
  stripeCustomerId: string
  results: StartSubscriptionForPropertyResult[]
}

/**
 * Create a Stripe subscription for one property under its org's Stripe
 * Customer. Idempotent: if a non-terminal subscription already exists for
 * the property, returns it without creating a duplicate.
 *
 * quantity is always 1 — a property is the billing unit. The subscription
 * carries property_id and org_id in its metadata, which the webhook keys
 * off when mirroring state back into billing_subscriptions and which the
 * invoice shows via description so the customer's bookkeeper can tell at a
 * glance which property a charge is for.
 */
export async function startSubscriptionForProperty(
  propertyId: string,
  opts: StartSubscriptionOptions = {},
): Promise<StartSubscriptionForPropertyResult> {
  const graceDays = opts.graceDays ?? 14
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 90) {
    throw new Error('graceDays must be an integer between 0 and 90')
  }

  const admin = createAdminClient()
  const s = stripe()

  const { data: property, error: propErr } = await admin
    .from('properties')
    .select('id, name, slug, org_id, created_at')
    .eq('id', propertyId)
    .maybeSingle()
  if (propErr) throw propErr
  if (!property) throw new Error(`No property with id "${propertyId}".`)

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('id, name, slug')
    .eq('id', property.org_id)
    .maybeSingle()
  if (orgErr) throw orgErr
  if (!org) throw new Error(`No organization with id "${property.org_id}".`)

  const existing = await existingSubscription(admin, propertyId)
  if (existing.subscriptionId && existing.customerId) {
    return {
      kind: 'existing',
      orgId: org.id,
      propertyId: property.id,
      stripeCustomerId: existing.customerId,
      stripeSubscriptionId: existing.subscriptionId,
    }
  }

  const priceId =
    opts.priceId ??
    (await requirePriceIdByLookupKey(
      s,
      HOTELOPS_PRICE_LOOKUP_KEYS.perPropertyMonthly,
    ))

  // Charge the one-time setup fee on the property's FIRST subscription
  // only. A resubscribe (after cancel) on a property that already has
  // billing_subscriptions history doesn't re-charge. To waive setup
  // fees entirely (e.g. as a promotion), deactivate the
  // hotelops_setup_fee Price in Stripe — resolvePriceIdByLookupKey
  // returns null and the fee is silently omitted.
  let setupFeePriceId: string | null = null
  if (!opts.skipSetupFee) {
    const alreadySubscribed = await propertyHasBeenSubscribed(property.id)
    if (!alreadySubscribed) {
      setupFeePriceId =
        opts.setupFeePriceId ??
        (await resolvePriceIdByLookupKey(
          s,
          HOTELOPS_PRICE_LOOKUP_KEYS.setupFee,
        ))
    }
  }

  const ownerEmail = await findOwnerEmail(admin, org.id)
  const customerId = await ensureCustomer(
    admin,
    s,
    org.id,
    org.name,
    ownerEmail,
  )

  const description = `HotelOps subscription — ${property.name}`
  const params: Stripe.SubscriptionCreateParams = {
    customer: customerId,
    items: [{ price: priceId, quantity: 1 }],
    collection_method: 'send_invoice',
    days_until_due: graceDays,
    description,
    metadata: {
      org_id: org.id,
      property_id: property.id,
      property_slug: property.slug,
      app: 'hotelops',
    },
  }
  if (setupFeePriceId) {
    params.add_invoice_items = [{ price: setupFeePriceId, quantity: 1 }]
  }

  // Stripe's idempotency key is scoped per property_id + price, so a
  // retry replays the same intent rather than double-billing. The setup
  // fee is part of the same call, so it inherits that protection.
  const subscription = await s.subscriptions.create(params, {
    idempotencyKey: `subscription:${property.id}:${priceId}`,
  })

  const dueAt = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000)
  await syncToDb(admin, property.id, org.id, customerId, subscription, dueAt)

  return {
    kind: 'created',
    orgId: org.id,
    propertyId: property.id,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    priceId,
    setupFeePriceId,
    paymentMethodDueAt: dueAt,
  }
}

/**
 * Convenience: subscribe every property an org owns that doesn't already
 * have a subscription. The admin "Start subscription" action calls this so
 * an org with several pre-existing properties gets one Stripe subscription
 * per property in a single click. Returns one entry per property (including
 * `existing` for properties already subscribed).
 */
export async function startSubscriptionsForOrg(
  orgId: string,
  opts: StartSubscriptionOptions = {},
): Promise<StartSubscriptionForOrgResult> {
  const admin = createAdminClient()
  const { data: properties, error } = await admin
    .from('properties')
    .select('id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
  if (error) throw error
  if (!properties?.length) {
    throw new Error(
      `Org "${orgId}" has no properties yet — add a property before starting billing.`,
    )
  }

  const results: StartSubscriptionForPropertyResult[] = []
  for (const p of properties) {
    results.push(await startSubscriptionForProperty(p.id, opts))
  }
  const customerId = results[0]?.stripeCustomerId
  if (!customerId) {
    throw new Error('Subscription creation produced no customer id.')
  }
  return { orgId, stripeCustomerId: customerId, results }
}

type AdminClient = ReturnType<typeof createAdminClient>

async function ensureCustomer(
  admin: AdminClient,
  s: Stripe,
  orgId: string,
  orgName: string,
  ownerEmail: string | null,
): Promise<string> {
  // Source of truth lives on organizations.stripe_customer_id (unique).
  // This avoids the "abandoned checkout creates a second Customer on
  // retry" bug — see ensureStripeCustomer in subscriptions.ts.
  const { data: org } = await admin
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', orgId)
    .maybeSingle()
  if (org?.stripe_customer_id) return org.stripe_customer_id

  const customer = await s.customers.create(
    {
      name: orgName,
      email: ownerEmail ?? undefined,
      metadata: { org_id: orgId, app: 'hotelops' },
    },
    { idempotencyKey: `customer:${orgId}` },
  )

  const { error: updErr } = await admin
    .from('organizations')
    .update({ stripe_customer_id: customer.id })
    .eq('id', orgId)
    .is('stripe_customer_id', null)
  if (updErr) {
    const { data: again } = await admin
      .from('organizations')
      .select('stripe_customer_id')
      .eq('id', orgId)
      .maybeSingle()
    if (again?.stripe_customer_id) return again.stripe_customer_id
    throw updErr
  }
  return customer.id
}

async function existingSubscription(
  admin: AdminClient,
  propertyId: string,
): Promise<{ subscriptionId: string | null; customerId: string | null }> {
  const { data } = await admin
    .from('billing_subscriptions')
    .select('stripe_subscription_id, stripe_customer_id, status')
    .eq('property_id', propertyId)
    .maybeSingle()
  if (!data?.stripe_subscription_id) {
    return { subscriptionId: null, customerId: data?.stripe_customer_id ?? null }
  }
  if (data.status === 'canceled' || data.status === 'incomplete_expired') {
    return { subscriptionId: null, customerId: data.stripe_customer_id ?? null }
  }
  return {
    subscriptionId: data.stripe_subscription_id,
    customerId: data.stripe_customer_id ?? null,
  }
}

async function syncToDb(
  admin: AdminClient,
  propertyId: string,
  orgId: string,
  customerId: string,
  subscription: Stripe.Subscription,
  dueAt: Date,
) {
  const item = subscription.items.data[0]
  const price = item?.price
  const { error } = await admin.from('billing_subscriptions').upsert(
    {
      property_id: propertyId,
      org_id: orgId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: price?.id ?? null,
      status: subscription.status,
      payment_method_due_at: dueAt.toISOString(),
      current_period_start: item?.current_period_start
        ? new Date(item.current_period_start * 1000).toISOString()
        : null,
      current_period_end: item?.current_period_end
        ? new Date(item.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      unit_amount_cents: price?.unit_amount ?? null,
      quantity: item?.quantity ?? 1,
      currency: price?.currency ?? 'usd',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'property_id' },
  )
  if (error) throw error
}

async function findOwnerEmail(
  admin: AdminClient,
  orgId: string,
): Promise<string | null> {
  const { data: profiles } = await admin
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .eq('role', 'org_owner')
    .limit(1)
  const ownerId = profiles?.[0]?.id
  if (!ownerId) return null
  const { data } = await admin.auth.admin.getUserById(ownerId)
  return data.user?.email ?? null
}
