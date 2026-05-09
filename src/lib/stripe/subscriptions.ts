import 'server-only'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BillingSubscription, BillingSubscriptionStatus } from '@/lib/supabase/types'
import { stripe } from './client'

/**
 * Days the customer has, after the subscription starts, to attach a payment
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
  quantity: number
  graceDays?: number
  /** Optional one-time setup fee Price id; tacked onto the first invoice. */
  setupFeePriceId?: string
}

/**
 * Create a per-property recurring subscription. Active and billable from day
 * one; collection_method='send_invoice' means Stripe issues the invoice but
 * does not auto-charge — that gives the customer `graceDays` to attach a
 * card. Once they do, the webhook flips the sub to charge_automatically.
 *
 * setupFeePriceId is added via add_invoice_items so it lands on the very
 * first invoice and never recurs.
 */
export async function startSubscription({
  orgId,
  customerId,
  priceId,
  quantity,
  graceDays = PAYMENT_METHOD_GRACE_DAYS,
  setupFeePriceId,
}: StartSubscriptionInput): Promise<Stripe.Subscription> {
  const params: Stripe.SubscriptionCreateParams = {
    customer: customerId,
    items: [{ price: priceId, quantity }],
    collection_method: 'send_invoice',
    days_until_due: graceDays,
    metadata: { org_id: orgId, app: 'hotelops' },
  }
  if (setupFeePriceId) {
    params.add_invoice_items = [{ price: setupFeePriceId, quantity: 1 }]
  }

  const subscription = await stripe().subscriptions.create(params, {
    idempotencyKey: `subscription:${orgId}:${priceId}`,
  })

  // Stamp the cooling-period deadline so the billing page can show a
  // countdown without parsing invoices.
  const dueAt = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000)
  await syncSubscriptionToDb(orgId, subscription, { paymentMethodDueAt: dueAt })
  return subscription
}

type SyncOptions = {
  /** Override the stored cooling-period deadline (set on creation, cleared
   *  on card attach). Omit to leave the existing value unchanged. */
  paymentMethodDueAt?: Date | null
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

  const update: Record<string, unknown> = {
    org_id: orgId,
    stripe_customer_id:
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id,
    stripe_subscription_id: subscription.id,
    stripe_price_id: price?.id ?? null,
    status: subscription.status as BillingSubscriptionStatus,
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

/** How many properties an org has — the default subscription quantity. */
export async function countPropertiesForOrg(orgId: string): Promise<number> {
  const admin = createAdminClient()
  const { count, error } = await admin
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
  if (error) throw error
  return count ?? 0
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
}

/**
 * Pull the customer's Stripe invoices for display in the billing UI. Read-
 * only and tolerant of network failures — the page should still render the
 * subscription card even if Stripe is unreachable.
 */
export async function listStripeInvoices(
  customerId: string,
  limit = 12,
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
    }))
  } catch (err) {
    console.warn(
      '[stripe] listStripeInvoices failed',
      err instanceof Error ? err.message : err,
    )
    return []
  }
}
