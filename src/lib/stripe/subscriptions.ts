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
 * The customer id is persisted on `organizations.stripe_customer_id` —
 * NOT on billing_subscriptions — so a Stripe Customer created mid-flow
 * (e.g. user creates customer, then abandons checkout) is reused on the
 * next attempt instead of orphaned. The Stripe-side idempotencyKey is a
 * second line of defense for the in-flight double-click case.
 */
export async function ensureStripeCustomer({
  orgId,
  orgName,
  ownerEmail,
}: EnsureCustomerInput): Promise<string> {
  const admin = createAdminClient()

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', orgId)
    .maybeSingle()
  if (orgErr) throw orgErr
  if (org?.stripe_customer_id) return org.stripe_customer_id

  const customer = await stripe().customers.create(
    {
      name: orgName,
      email: ownerEmail ?? undefined,
      metadata: { org_id: orgId, app: 'hotelops' },
    },
    {
      // Same org calling this twice in flight (e.g. user double-clicks
      // the CTA) must not create two customers.
      idempotencyKey: `customer:${orgId}`,
    },
  )

  // Persist immediately so an abandoned checkout is recoverable. The
  // unique constraint on organizations.stripe_customer_id means a
  // concurrent racer that beat us to the Stripe create will have already
  // stamped its id — in that case we lose the race, drop our newly-
  // created customer, and adopt the winner's id.
  const { error: updErr } = await admin
    .from('organizations')
    .update({ stripe_customer_id: customer.id })
    .eq('id', orgId)
    .is('stripe_customer_id', null)
  if (updErr) {
    // Race: another caller stamped the column between our SELECT and
    // UPDATE. Re-read and adopt their id; the customer we just created
    // is now an orphan but Stripe is fine with duplicate Customers (no
    // real cost) and the idempotencyKey would normally prevent this.
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

/**
 * Resolve the payment method id we should reuse when starting a fresh
 * subscription for a property whose previous sub has ended (resubscribe
 * flow). Strategy: take the default_payment_method_id stamped on the
 * most-recent billing_subscriptions row for the property, but only after
 * confirming the PM is still attached to this org's Stripe Customer —
 * the customer might have detached it from the wallet in the interim.
 *
 * Returns null when no prior PM is recoverable. Callers that get null
 * should fall back to send_invoice + grace days so the customer can pay
 * the first invoice manually or attach a fresh card.
 */
export async function resolveResubscribePaymentMethod(
  propertyId: string,
  customerId: string,
): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('default_payment_method_id')
    .eq('property_id', propertyId)
    .maybeSingle()
  if (error) throw error
  const pmId = data?.default_payment_method_id ?? null
  if (!pmId) return null

  try {
    const pm = await stripe().paymentMethods.retrieve(pmId)
    const pmCustomer =
      typeof pm.customer === 'string' ? pm.customer : (pm.customer?.id ?? null)
    if (pmCustomer !== customerId) return null
    return pmId
  } catch {
    // Detached / deleted PM — can't reuse.
    return null
  }
}

/**
 * Best-effort: pay the most-recent open invoice for a subscription using
 * the provided payment method. Used after a card is attached/swapped so
 * the customer isn't left with a still-open first invoice that they
 * didn't realize wasn't paid by the act of putting the card on file.
 *
 * Swallows decline / "no open invoice" / network failures so the caller
 * isn't forced to error out the surrounding UX flow — if the charge
 * fails, the invoice stays open and Stripe's normal dunning takes over.
 */
export async function payOpenInvoiceForSubscription(
  subscriptionId: string,
  paymentMethodId: string,
): Promise<{ paid: boolean; reason?: string }> {
  const s = stripe()
  try {
    const subscription = await s.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice'],
    })
    const latest = subscription.latest_invoice
    if (!latest || typeof latest === 'string') return { paid: false, reason: 'no-invoice' }
    if (latest.status !== 'open') return { paid: false, reason: 'not-open' }
    if (!latest.id) return { paid: false, reason: 'no-id' }
    if ((latest.amount_due ?? 0) <= 0) return { paid: false, reason: 'zero-due' }

    await s.invoices.pay(latest.id, { payment_method: paymentMethodId })
    return { paid: true }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown'
    console.warn('[stripe] payOpenInvoiceForSubscription failed', reason)
    return { paid: false, reason }
  }
}

/**
 * Has this property ever had a Stripe subscription? Used to decide
 * whether to include the one-time setup fee in a new property
 * subscription: charge it on a property's first-ever sub, but not on
 * resubscribes (a canceled-and-then-resumed property already paid).
 *
 * Looks for ANY billing_subscriptions row for the property with a
 * stripe_subscription_id set. A canceled sub still satisfies this — the
 * row is not deleted on cancel, only on property delete or via the
 * platform-admin reset flow (both of which legitimately reset history).
 */
export async function propertyHasBeenSubscribed(
  propertyId: string,
): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('property_id')
    .eq('property_id', propertyId)
    .not('stripe_subscription_id', 'is', null)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
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

  // Tolerate the property having been deleted between the Stripe event
  // firing and us handling it. Without this guard the upsert below would
  // FK-violate on property_id and the webhook would 500-retry forever
  // for a sub we already canceled. We've already canceled the Stripe
  // subscription in removePropertyAction, so dropping the event on the
  // floor is safe.
  const { data: propertyRow, error: propErr } = await admin
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .maybeSingle()
  if (propErr) throw propErr
  if (!propertyRow) {
    console.warn(
      `[billing] syncSubscriptionToDb: property ${propertyId} no longer ` +
        `exists; dropping event for subscription ${subscription.id}.`,
    )
    return
  }

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
 * Resolve the org's designated auto-pay default payment method. The
 * source of truth is the Stripe Customer's invoice_settings
 * .default_payment_method — set only when the customer explicitly opts
 * in via the autopay_default custom_field on Checkout. Returns null
 * when nothing is designated (in which case callers should fall back to
 * send_invoice rather than guessing which card to charge).
 *
 * Also returns null when the designated PM has been detached from the
 * Customer wallet — that's the safe interpretation of "card is no
 * longer available for auto-pay".
 */
export async function getOrgAutopayDefaultPaymentMethod(
  orgId: string,
): Promise<string | null> {
  const customerId = await getStripeCustomerForOrg(orgId)
  if (!customerId) return null
  try {
    const customer = await stripe().customers.retrieve(customerId)
    if (customer.deleted) return null
    const pm = customer.invoice_settings?.default_payment_method
    const pmId = typeof pm === 'string' ? pm : (pm?.id ?? null)
    if (!pmId) return null

    // Validate the PM is still attached. customers.retrieve doesn't
    // detect detached PMs, so we do a focused retrieve to be sure.
    const pmObject = await stripe().paymentMethods.retrieve(pmId)
    const pmCustomer =
      typeof pmObject.customer === 'string'
        ? pmObject.customer
        : (pmObject.customer?.id ?? null)
    if (pmCustomer !== customerId) return null
    return pmId
  } catch (err) {
    console.warn(
      '[stripe] getOrgAutopayDefaultPaymentMethod failed',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

/**
 * The single Stripe Customer for the org. Reads from organizations, which
 * is the source of truth (billing_subscriptions denormalizes it but only
 * once a subscription exists). Returns null when the org has never gone
 * through the Stripe-customer-creation flow.
 */
export async function getStripeCustomerForOrg(
  orgId: string,
): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', orgId)
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

export type SavedCard = {
  id: string
  brand: string | null
  last4: string | null
  exp_month: number | null
  exp_year: number | null
}

/**
 * List the saved cards on the org's Stripe Customer. Used by the Billing
 * page's per-property card picker so the customer can swap a property's
 * subscription onto a card they've already saved (without re-typing it).
 *
 * Returns [] when the org has no Stripe Customer yet, or when the Stripe
 * call fails — the picker degrades to "Add new card" only, which is the
 * same as the old behavior. We don't surface the error to the UI; the
 * server logs it.
 */
export async function listOrgPaymentMethods(
  orgId: string,
): Promise<SavedCard[]> {
  const customerId = await getStripeCustomerForOrg(orgId)
  if (!customerId) return []
  try {
    const result = await stripe().paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 50,
    })
    return result.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? null,
      last4: pm.card?.last4 ?? null,
      exp_month: pm.card?.exp_month ?? null,
      exp_year: pm.card?.exp_year ?? null,
    }))
  } catch (err) {
    console.warn(
      '[stripe] listOrgPaymentMethods failed',
      err instanceof Error ? err.message : err,
    )
    return []
  }
}
