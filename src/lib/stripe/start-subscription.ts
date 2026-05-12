import 'server-only'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from './client'
import {
  HOTELOPS_PRICE_LOOKUP_KEYS,
  requirePriceIdByLookupKey,
  resolvePriceIdByLookupKey,
} from './prices'

export type StartSubscriptionOptions = {
  priceId?: string
  setupFeePriceId?: string
  quantity?: number
  graceDays?: number
}

export type StartSubscriptionResult =
  | {
      kind: 'created'
      orgId: string
      stripeCustomerId: string
      stripeSubscriptionId: string
      status: Stripe.Subscription.Status
      quantity: number
      priceId: string
      setupFeePriceId: string | null
      paymentMethodDueAt: Date
    }
  | {
      kind: 'existing'
      orgId: string
      stripeCustomerId: string
      stripeSubscriptionId: string
    }

/**
 * Create a per-property Stripe subscription for the org. Idempotent: returns
 * `{ kind: 'existing' }` if a non-terminal subscription is already attached.
 * Mirrors the Stripe state into `billing_subscriptions` and stamps a 14-day
 * (configurable) payment-method-due deadline.
 *
 * Called from the "Start subscription" button on /admin/tenants/[id] via
 * `startSubscriptionAction` in `lib/admin/actions.ts`.
 */
export async function startSubscriptionForOrg(
  orgId: string,
  opts: StartSubscriptionOptions = {},
): Promise<StartSubscriptionResult> {
  const graceDays = opts.graceDays ?? 14
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 90) {
    throw new Error('graceDays must be an integer between 0 and 90')
  }

  const admin = createAdminClient()
  const s = stripe()

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('id, name, slug')
    .eq('id', orgId)
    .maybeSingle()
  if (orgErr) throw orgErr
  if (!org) throw new Error(`No organization with id "${orgId}".`)

  // Short-circuit: a non-terminal subscription on file means we already
  // have what we'd create. Return its id rather than making a duplicate.
  const existing = await existingSubscriptionId(admin, orgId)
  if (existing.subscriptionId) {
    return {
      kind: 'existing',
      orgId: org.id,
      stripeCustomerId: existing.customerId!,
      stripeSubscriptionId: existing.subscriptionId,
    }
  }

  const priceId =
    opts.priceId ??
    (await requirePriceIdByLookupKey(
      s,
      HOTELOPS_PRICE_LOOKUP_KEYS.perPropertyMonthly,
    ))
  const setupFeePriceId =
    opts.setupFeePriceId ??
    (await resolvePriceIdByLookupKey(
      s,
      HOTELOPS_PRICE_LOOKUP_KEYS.setupFee,
    ))

  const propertyCount = await countProperties(admin, org.id)
  const quantity = opts.quantity ?? Math.max(1, propertyCount)
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error('quantity must be a positive integer')
  }

  const ownerEmail = await findOwnerEmail(admin, org.id)
  const customerId = await ensureCustomer(admin, s, org.id, org.name, ownerEmail)

  const params: Stripe.SubscriptionCreateParams = {
    customer: customerId,
    items: [{ price: priceId, quantity }],
    collection_method: 'send_invoice',
    days_until_due: graceDays,
    metadata: { org_id: org.id, app: 'hotelops' },
  }
  if (setupFeePriceId) {
    params.add_invoice_items = [{ price: setupFeePriceId, quantity: 1 }]
  }

  const subscription = await s.subscriptions.create(params, {
    idempotencyKey: `subscription:${org.id}:${priceId}`,
  })

  const dueAt = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000)
  await syncToDb(admin, org.id, customerId, subscription, dueAt)

  return {
    kind: 'created',
    orgId: org.id,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    quantity,
    priceId,
    setupFeePriceId,
    paymentMethodDueAt: dueAt,
  }
}

type AdminClient = ReturnType<typeof createAdminClient>

async function countProperties(
  admin: AdminClient,
  orgId: string,
): Promise<number> {
  const { count, error } = await admin
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
  if (error) throw error
  return count ?? 0
}

async function ensureCustomer(
  admin: AdminClient,
  s: Stripe,
  orgId: string,
  orgName: string,
  ownerEmail: string | null,
): Promise<string> {
  const { data } = await admin
    .from('billing_subscriptions')
    .select('stripe_customer_id')
    .eq('org_id', orgId)
    .maybeSingle()
  if (data?.stripe_customer_id) return data.stripe_customer_id

  const customer = await s.customers.create(
    {
      name: orgName,
      email: ownerEmail ?? undefined,
      metadata: { org_id: orgId, app: 'hotelops' },
    },
    { idempotencyKey: `customer:${orgId}` },
  )

  const { error } = await admin.from('billing_subscriptions').upsert(
    {
      org_id: orgId,
      stripe_customer_id: customer.id,
      status: 'incomplete',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id' },
  )
  if (error) throw error
  return customer.id
}

async function existingSubscriptionId(
  admin: AdminClient,
  orgId: string,
): Promise<{ subscriptionId: string | null; customerId: string | null }> {
  const { data } = await admin
    .from('billing_subscriptions')
    .select('stripe_subscription_id, stripe_customer_id, status')
    .eq('org_id', orgId)
    .maybeSingle()
  if (!data?.stripe_subscription_id) {
    return { subscriptionId: null, customerId: data?.stripe_customer_id ?? null }
  }
  // Re-running is allowed if the prior attempt ended terminal.
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
  orgId: string,
  customerId: string,
  subscription: Stripe.Subscription,
  dueAt: Date,
) {
  const item = subscription.items.data[0]
  const price = item?.price
  const { error } = await admin.from('billing_subscriptions').upsert(
    {
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
    { onConflict: 'org_id' },
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
