import 'server-only'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BillingSubscription, BillingSubscriptionStatus } from '@/lib/supabase/types'
import { stripe } from './client'

/**
 * The 14-day cooling period between admin onboarding and first charge. The
 * subscription is created immediately so revenue is "on the books" but Stripe
 * defers billing until the trial ends, giving the customer time to add a card.
 */
export const TRIAL_PERIOD_DAYS = 14

type EnsureCustomerInput = {
  orgId: string
  orgName: string
  ownerEmail: string | null
}

/**
 * Find-or-create the Stripe Customer for an org. The org_id metadata is the
 * link Stripe-side; we also store the customer id in billing_subscriptions
 * for the reverse lookup.
 */
export async function ensureStripeCustomer({
  orgId,
  orgName,
  ownerEmail,
}: EnsureCustomerInput): Promise<string> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('billing_subscriptions')
    .select('stripe_customer_id')
    .eq('org_id', orgId)
    .maybeSingle()
  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id
  }

  const customer = await stripe().customers.create(
    {
      name: orgName,
      email: ownerEmail ?? undefined,
      metadata: { org_id: orgId, app: 'hotelops' },
    },
    {
      // Same org calling this twice in flight (e.g. user double-clicks the
      // CTA) must not create two customers.
      idempotencyKey: `customer:${orgId}`,
    },
  )

  const { error } = await admin
    .from('billing_subscriptions')
    .upsert(
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

type StartSubscriptionInput = {
  orgId: string
  customerId: string
  priceId: string
  trialDays?: number
}

/**
 * Create a subscription with a trial. No payment method is required up front
 * — Stripe's `trial_settings.end_behavior.missing_payment_method = "pause"`
 * defers the failure mode if no card is added by trial end.
 */
export async function startSubscription({
  orgId,
  customerId,
  priceId,
  trialDays = TRIAL_PERIOD_DAYS,
}: StartSubscriptionInput): Promise<Stripe.Subscription> {
  const subscription = await stripe().subscriptions.create(
    {
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: trialDays,
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      trial_settings: {
        end_behavior: { missing_payment_method: 'pause' },
      },
      metadata: { org_id: orgId, app: 'hotelops' },
    },
    { idempotencyKey: `subscription:${orgId}:${priceId}` },
  )

  await syncSubscriptionToDb(orgId, subscription)
  return subscription
}

/**
 * Mirror a Stripe subscription into billing_subscriptions. Called from the
 * webhook handler on every customer.subscription.* event and from the admin
 * script after creation. The default-payment-method snapshot is denormalized
 * here so the billing page doesn't need a Stripe round-trip.
 */
export async function syncSubscriptionToDb(
  orgId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  const admin = createAdminClient()
  const item = subscription.items.data[0]

  const defaultPmId = resolveDefaultPaymentMethodId(subscription)
  let pmBrand: string | null = null
  let pmLast4: string | null = null
  if (defaultPmId) {
    try {
      const pm = await stripe().paymentMethods.retrieve(defaultPmId)
      pmBrand = pm.card?.brand ?? null
      pmLast4 = pm.card?.last4 ?? null
    } catch {
      // PM may have been detached; leave brand/last4 null.
    }
  }

  const update = {
    org_id: orgId,
    stripe_customer_id:
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id,
    stripe_subscription_id: subscription.id,
    stripe_price_id: item?.price.id ?? null,
    status: subscription.status as BillingSubscriptionStatus,
    trial_end: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    current_period_start: item?.current_period_start
      ? new Date(item.current_period_start * 1000).toISOString()
      : null,
    current_period_end: item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    default_payment_method_id: defaultPmId,
    default_payment_brand: pmBrand,
    default_payment_last4: pmLast4,
    updated_at: new Date().toISOString(),
  }

  const { error } = await admin
    .from('billing_subscriptions')
    .upsert(update, { onConflict: 'org_id' })
  if (error) throw error
}

function resolveDefaultPaymentMethodId(
  subscription: Stripe.Subscription,
): string | null {
  const dpm = subscription.default_payment_method
  if (!dpm) return null
  return typeof dpm === 'string' ? dpm : dpm.id
}

export async function getSubscriptionForOrg(
  orgId: string,
): Promise<BillingSubscription | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  return (data as BillingSubscription | null) ?? null
}
