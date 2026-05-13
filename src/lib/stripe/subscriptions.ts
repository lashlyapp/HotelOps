import 'server-only'
import type Stripe from 'stripe'
import { syncGateToCdn } from '@/lib/billing/cdn-gate'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BillingSubscription, BillingSubscriptionStatus } from '@/lib/supabase/types'
import { stripe } from './client'

/**
 * Days the customer has, after a subscription starts, to attach a payment
 * method before the first invoice goes past due. Implemented Stripe-side as
 * collection_method='send_invoice' + days_until_due=N. The subscription is
 * `active` from day one — this is *not* a trial.
 */
export const PAYMENT_METHOD_GRACE_DAYS = 14

type EnsureCustomerInput = {
  orgId: string
  orgName: string
  ownerEmail: string | null
}

/**
 * Find-or-create the org-level Stripe Customer. Each property in the org
 * has its own Subscription under this single Customer so the customer can
 * use a different card per property while sharing one billing identity
 * (one tax id, one billing email, one Manage-billing portal).
 *
 * The customer id is denormalized onto every billing_subscriptions row for
 * the org, so we look it up from any existing row first and only fall back
 * to a Stripe API call when there is none yet.
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
    .not('stripe_customer_id', 'is', null)
    .limit(1)
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

  return customer.id
}

type SyncOptions = {
  /** Override the stored cooling-period deadline (set on creation, cleared
   *  on card attach). Omit to leave the existing value unchanged. */
  paymentMethodDueAt?: Date | null
}

/**
 * Mirror a Stripe subscription into billing_subscriptions, keyed by the
 * property the subscription was created for. The Stripe Subscription must
 * carry property_id and org_id in its metadata — that's the link both the
 * webhook and the start-subscription paths set.
 *
 * The default-payment-method snapshot is denormalized here so the billing
 * page doesn't need a Stripe round-trip to show "Visa ending 4242" per
 * property.
 *
 * past_due_since is stamped the first time we see status=past_due/unpaid
 * and cleared when the status leaves that state — that's the timestamp the
 * 15-day gating policy keys off.
 */
export async function syncSubscriptionToDb(
  propertyId: string,
  orgId: string,
  subscription: Stripe.Subscription,
  options: SyncOptions = {},
): Promise<void> {
  const admin = createAdminClient()
  const item = subscription.items.data[0]
  const price = item?.price

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

  const status = subscription.status as BillingSubscriptionStatus
  const isPastDue = status === 'past_due' || status === 'unpaid'

  const { data: existing } = await admin
    .from('billing_subscriptions')
    .select('past_due_since')
    .eq('property_id', propertyId)
    .maybeSingle()
  const pastDueSince = isPastDue
    ? (existing?.past_due_since ?? new Date().toISOString())
    : null

  const update: Record<string, unknown> = {
    property_id: propertyId,
    org_id: orgId,
    stripe_customer_id:
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id,
    stripe_subscription_id: subscription.id,
    stripe_price_id: price?.id ?? null,
    status,
    past_due_since: pastDueSince,
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
    default_payment_method_id: defaultPmId,
    default_payment_brand: pmBrand,
    default_payment_last4: pmLast4,
    updated_at: new Date().toISOString(),
  }
  if (Object.prototype.hasOwnProperty.call(options, 'paymentMethodDueAt')) {
    update.payment_method_due_at = options.paymentMethodDueAt
      ? options.paymentMethodDueAt.toISOString()
      : null
  }

  const { error } = await admin
    .from('billing_subscriptions')
    .upsert(update, { onConflict: 'property_id' })
  if (error) throw error

  // Propagate the (possibly new) gate state to Cloudflare KV so the
  // cdn-gate Worker enforces it on incoming media requests. The CDN gate
  // is org-level (any property in a bad state locks the org's media);
  // syncGateToCdn re-derives that across the org's subscriptions.
  try {
    await syncGateToCdn(orgId)
  } catch (err) {
    console.warn(
      '[billing] syncGateToCdn failed; CDN gate may be stale until next event',
      err instanceof Error ? err.message : err,
    )
  }
}

function resolveDefaultPaymentMethodId(
  subscription: Stripe.Subscription,
): string | null {
  const dpm = subscription.default_payment_method
  if (!dpm) return null
  return typeof dpm === 'string' ? dpm : dpm.id
}

/**
 * Load the subscription for a single property. Returns null if the property
 * hasn't been subscribed yet.
 */
export async function getSubscriptionForProperty(
  propertyId: string,
): Promise<BillingSubscription | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('*')
    .eq('property_id', propertyId)
    .maybeSingle()
  if (error) throw error
  return (data as BillingSubscription | null) ?? null
}

/**
 * Load all subscriptions for an org, ordered by created_at so the billing
 * page renders them in the same order as the property list.
 */
export async function getSubscriptionsForOrg(
  orgId: string,
): Promise<BillingSubscription[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as BillingSubscription[] | null) ?? []
}

/**
 * The single Stripe Customer for the org, looked up from any existing
 * subscription row. Returns null when the org has never subscribed.
 */
export async function getStripeCustomerForOrg(
  orgId: string,
): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('stripe_customer_id')
    .eq('org_id', orgId)
    .not('stripe_customer_id', 'is', null)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.stripe_customer_id ?? null
}

export type StripeInvoiceSummary = {
  id: string
  number: string | null
  status: Stripe.Invoice.Status | null
  amount_due_cents: number
  amount_paid_cents: number
  currency: string
  created_at: string
  due_at: string | null
  hosted_url: string | null
  pdf_url: string | null
  subscription_id: string | null
}

/**
 * Pull the customer's Stripe invoices for display in the billing UI. Read-
 * only and tolerant of network failures — the page should still render the
 * subscription cards even if Stripe is unreachable. subscription_id is kept
 * on the result so the billing page can group invoices by property.
 */
export async function listStripeInvoices(
  customerId: string,
  limit = 24,
): Promise<StripeInvoiceSummary[]> {
  try {
    const result = await stripe().invoices.list({
      customer: customerId,
      limit,
    })
    return result.data.map((inv) => ({
      id: inv.id ?? '',
      number: inv.number ?? null,
      status: inv.status ?? null,
      amount_due_cents: inv.amount_due ?? 0,
      amount_paid_cents: inv.amount_paid ?? 0,
      currency: inv.currency ?? 'usd',
      created_at: new Date(inv.created * 1000).toISOString(),
      due_at: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
      hosted_url: inv.hosted_invoice_url ?? null,
      pdf_url: inv.invoice_pdf ?? null,
      subscription_id: extractSubscriptionId(inv),
    }))
  } catch (err) {
    console.warn(
      '[stripe] listStripeInvoices failed',
      err instanceof Error ? err.message : err,
    )
    return []
  }
}

/**
 * Pull the originating Subscription id off an Invoice. In modern Stripe API
 * versions this lives at `invoice.parent.subscription_details.subscription`;
 * older code paths used a top-level `invoice.subscription` that is no longer
 * exposed in the TS types. We accept either shape so listStripeInvoices
 * keeps working across SDK upgrades.
 */
function extractSubscriptionId(inv: Stripe.Invoice): string | null {
  const parent = inv.parent
  if (parent?.type === 'subscription_details') {
    const ref = parent.subscription_details?.subscription
    if (typeof ref === 'string') return ref
    if (ref && typeof ref === 'object') return ref.id ?? null
  }
  return null
}
