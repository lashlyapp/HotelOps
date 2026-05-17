import 'server-only'
import type Stripe from 'stripe'
import { DEFAULT_CURRENCY, type Currency } from '@/lib/billing/currency'
import { TRIAL_STORAGE_BYTES } from '@/lib/billing/trial'
import { STORAGE_BLOCK_BYTES } from '@/lib/storage/usage'
import { createAdminClient } from '@/lib/supabase/admin'
import { ADDONS, type AddonKey } from './addon-config'
import { stripe } from './client'
import {
  HOTELOPS_PRICE_LOOKUP_KEYS,
  requirePriceIdByLookupKey,
  resolvePriceIdByLookupKey,
} from './prices'
import { propertyHasBeenSubscribed } from './subscriptions'

/**
 * Resolve the Stripe Price ids for every add-on the org currently has
 * turned on. Returns the empty list when no add-ons are active, so the
 * caller can just spread it into `items` / `line_items` unconditionally.
 *
 * Used by both subscription-creation paths (server-side
 * startSubscriptionForProperty and the /api/stripe/setup-checkout
 * `mode: 'subscription'` path) so a property added while the org has
 * Signage Unlimited on inherits the line item at create time, not via
 * a follow-up reconciler pass.
 */
export async function resolveActiveOrgAddonPriceIds(
  s: Stripe,
  orgId: string,
): Promise<Array<{ key: AddonKey; priceId: string }>> {
  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organizations')
    .select(
      'signage_unlimited_addon_active, guest_experience_addon_active, currency',
    )
    .eq('id', orgId)
    .maybeSingle()
  if (!org) return []
  const currency: Currency = (org.currency as Currency | null) ?? DEFAULT_CURRENCY
  const out: Array<{ key: AddonKey; priceId: string }> = []
  if (org.signage_unlimited_addon_active) {
    const priceId = await resolvePriceIdByLookupKey(
      s,
      ADDONS.signage_unlimited.lookupKey,
      currency,
    )
    if (priceId) out.push({ key: 'signage_unlimited', priceId })
  }
  if (org.guest_experience_addon_active) {
    const priceId = await resolvePriceIdByLookupKey(
      s,
      ADDONS.guest_experience.lookupKey,
      currency,
    )
    if (priceId) out.push({ key: 'guest_experience', priceId })
  }
  return out
}

export type StartSubscriptionOptions = {
  priceId?: string
  /** Override the setup-fee Price id (otherwise resolved from the
   *  hotelops_setup_fee lookup key). The fee is only charged when this
   *  property has no prior subscription history — a resubscribe after
   *  cancellation is NOT a new property. */
  setupFeePriceId?: string
  /** Suppress the setup fee for this specific call even if a Price is
   *  configured. Useful for ops/migration scripts that re-create a sub
   *  for a property that's already paid setup historically. */
  skipSetupFee?: boolean
  /** Required. The payment method to charge the first (and subsequent)
   *  invoices against. Every subscription is created on
   *  `charge_automatically` — there is no fall-back send-invoice path.
   *  Callers without a saved card on file should route the customer
   *  through Stripe Checkout (`/api/stripe/setup-checkout`) instead. */
  defaultPaymentMethodId: string
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
  opts: StartSubscriptionOptions,
): Promise<StartSubscriptionForPropertyResult> {
  if (!opts.defaultPaymentMethodId) {
    throw new Error(
      'defaultPaymentMethodId is required — route the customer through ' +
        '/api/stripe/setup-checkout when no saved card is available.',
    )
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
    .select('id, name, slug, currency, trial_ends_at')
    .eq('id', property.org_id)
    .maybeSingle()
  if (orgErr) throw orgErr
  if (!org) throw new Error(`No organization with id "${property.org_id}".`)
  const currency: Currency = (org.currency as Currency | null) ?? DEFAULT_CURRENCY

  // Honor remaining trial days when subscribing during trial. Stripe
  // accepts `trial_end` as a unix timestamp; the subscription enters
  // status='trialing' until that date and the first invoice (including
  // the setup fee added below via add_invoice_items) is generated then.
  // If the trial already ended or never existed, bill immediately.
  // Same logic for every property in a multi-property org: their org's
  // trial window is the source of truth, not per-property.
  const trialEndUnix = (() => {
    if (!org.trial_ends_at) return null
    const ts = new Date(org.trial_ends_at).getTime()
    if (!Number.isFinite(ts)) return null
    const seconds = Math.floor(ts / 1000)
    return seconds > Math.floor(Date.now() / 1000) ? seconds : null
  })()

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
      currency,
    ))

  // Charge the one-time setup fee on the property's FIRST subscription
  // only. A resubscribe (after cancel) on a property that already has
  // billing_subscriptions history doesn't re-charge. To waive setup
  // fees entirely (e.g. as a promotion), deactivate the
  // hotelops_setup_fee Price in Stripe — resolvePriceIdByLookupKey
  // returns null and the fee is silently omitted. Resolved per-currency
  // for the org so EUR / GBP / MXN customers pay in their currency.
  let setupFeePriceId: string | null = null
  if (!opts.skipSetupFee) {
    const alreadySubscribed = await propertyHasBeenSubscribed(property.id)
    if (!alreadySubscribed) {
      setupFeePriceId =
        opts.setupFeePriceId ??
        (await resolvePriceIdByLookupKey(
          s,
          HOTELOPS_PRICE_LOOKUP_KEYS.setupFee,
          currency,
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
    currency,
  )

  // Stripe caps Subscription.description at 500 chars; property.name is a
  // free-form text column so truncate defensively.
  const description = `HotelOps subscription — ${property.name}`.slice(0, 500)
  const params: Stripe.SubscriptionCreateParams = {
    customer: customerId,
    items: [
      { price: priceId, quantity: 1 },
      // Inherit whatever add-ons the org has turned on globally so a
      // brand-new property is billed correctly from invoice 1 instead
      // of waiting for the reconciler to attach the items.
      ...(await resolveActiveOrgAddonPriceIds(s, org.id)).map((a) => ({
        price: a.priceId,
        quantity: 1,
      })),
    ],
    description,
    metadata: {
      org_id: org.id,
      property_id: property.id,
      property_slug: property.slug,
      app: 'hotelops',
    },
    collection_method: 'charge_automatically',
    default_payment_method: opts.defaultPaymentMethodId,
    // Stripe Tax: ask Stripe to compute + add the right tax line item
    // on every invoice for this subscription. Requires Stripe Tax to
    // be enabled in the Dashboard (Settings → Tax → Activate). When
    // the Customer doesn't yet have a usable tax address, Stripe
    // marks the line as inclusive=false and warns on the invoice
    // rather than failing the subscription create — the operator
    // adds the address from /billing later. Critical for EU/UK
    // customers (VAT / GST) but harmless for US customers in states
    // where we have no nexus.
    automatic_tax: { enabled: true },
    // When the org is still inside its 7-day signup trial, defer the
    // first invoice to trial_end. The card is on file from this call
    // onward, but no money moves until the trial window closes. Honors
    // the marketing promise: "7 days free, then $100/property/month."
    ...(trialEndUnix ? { trial_end: trialEndUnix } : {}),
  }
  if (setupFeePriceId) {
    params.add_invoice_items = [{ price: setupFeePriceId, quantity: 1 }]
  }

  // Stripe's idempotency key is scoped per property_id + price, so a
  // retry replays the same intent rather than double-billing. This also
  // closes the (rare) race where two concurrent callers both pass the
  // `propertyHasBeenSubscribed === false` check before either persists —
  // Stripe returns the same Subscription on the second call rather than
  // creating a duplicate (and double-charging the setup fee).
  const subscription = await s.subscriptions.create(params, {
    idempotencyKey: `subscription:${property.id}:${priceId}`,
  })

  await syncToDb(admin, property.id, org.id, customerId, subscription)

  // Trial → paid conversion: the signup flow created this property with
  // a 10 GB cap (TRIAL_STORAGE_BYTES); the base plan includes 25 GB. Lift
  // the quota now so the customer isn't suddenly sitting in their first
  // overage block the moment they add a card. Idempotent — only bumps
  // when the current quota matches the trial cap.
  await admin
    .from('properties')
    .update({ storage_quota_bytes: STORAGE_BLOCK_BYTES })
    .eq('id', property.id)
    .eq('storage_quota_bytes', TRIAL_STORAGE_BYTES)

  // Stamp the org's trial → paid conversion timestamp once. Only on
  // the first subscription (when trial_converted_at is still null);
  // subsequent property subs leave the value alone. The admin
  // dashboard reads this to compute conversion metrics.
  await admin
    .from('organizations')
    .update({ trial_converted_at: new Date().toISOString() })
    .eq('id', org.id)
    .is('trial_converted_at', null)
    .not('trial_ends_at', 'is', null)

  return {
    kind: 'created',
    orgId: org.id,
    propertyId: property.id,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    priceId,
    setupFeePriceId,
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
  opts: StartSubscriptionOptions,
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
  currency: Currency,
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

  // preferred_locales: an ISO-like hint Stripe uses for invoice
  // formatting (currency placement, date format, decimal separator).
  // We don't have a per-customer locale stored separately so we map
  // off the currency: EUR → fr-FR (representative European format),
  // GBP → en-GB, MXN → es-MX, AUD → en-AU. Imperfect but it's the
  // difference between "$99.00" and "€99,00" on the customer's PDF.
  const customer = await s.customers.create(
    {
      name: orgName,
      email: ownerEmail ?? undefined,
      metadata: { org_id: orgId, app: 'hotelops' },
      preferred_locales: [stripeLocaleForCurrency(currency)],
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

/**
 * Map an org currency to a Stripe `preferred_locales` value. Stripe
 * uses this purely for invoice / receipt formatting (currency
 * placement, decimal separator); it does not affect what the
 * Customer is billed. We pick representative locales rather than
 * exposing per-customer locale storage because the visible
 * difference is small and the operational cost of tracking
 * per-customer language alongside currency isn't worth it yet.
 */
function stripeLocaleForCurrency(currency: Currency): string {
  switch (currency) {
    case 'eur':
      return 'fr-FR'
    case 'gbp':
      return 'en-GB'
    case 'mxn':
      return 'es-MX'
    case 'aud':
      return 'en-AU'
    case 'usd':
    default:
      return 'en-US'
  }
}
