import { NextResponse } from 'next/server'
import { requireOrgOwner } from '@/lib/auth/session'
import { stripe } from '@/lib/stripe/client'
import {
  HOTELOPS_PRICE_LOOKUP_KEYS,
  requirePriceIdByLookupKey,
  resolvePriceIdByLookupKey,
} from '@/lib/stripe/prices'
import { resolveActiveOrgAddonPriceIds } from '@/lib/stripe/start-subscription'
import {
  ensureStripeCustomer,
  getSubscriptionForProperty,
  propertyHasBeenSubscribed,
} from '@/lib/stripe/subscriptions'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Prompt the customer, inside Stripe's hosted Checkout form, whether the
 * card they're entering should become the org's default for auto-paying
 * future property invoices. The webhook reads this field's value on
 * checkout.session.completed and, if 'yes', sets the Customer's
 * invoice_settings.default_payment_method. Without this prompt we'd
 * either silently auto-charge whatever card happened to be most recent
 * (wrong on multi-card accounts) or never auto-charge new properties at
 * all (annoying on single-card accounts).
 *
 * The `key` is intentionally alphanumeric-only ("autopaydefault", no
 * underscore): Stripe rejects custom_field keys with non-alphanumeric
 * characters, and Checkout.sessions.create throws before returning a URL
 * — which previously surfaced to the user as a bare 500.
 *
 * The `label.custom` text is capped at 50 characters by Stripe; anything
 * longer makes Checkout.sessions.create reject with "Invalid string …
 * must be at most 50 characters" before returning a URL. Keep this terse.
 *
 * Returned as a literal so TS infers the discriminated union exactly —
 * the Stripe SDK exposes Checkout.SessionCreateParams as a type alias
 * (not a namespace), so we can't directly type a const as
 * SessionCreateParams.CustomField.
 */
function autopayCustomField() {
  return {
    key: 'autopaydefault',
    type: 'dropdown' as const,
    label: {
      type: 'custom' as const,
      custom: 'Use as auto-pay default for new properties?',
    },
    dropdown: {
      options: [
        { label: 'Yes — use as default for auto-pay', value: 'yes' },
        { label: 'No — only use it for this property', value: 'no' },
      ],
      default_value: 'yes',
    },
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Owner-only: create a Stripe Checkout session scoped to a single property,
 * so the customer can put a different credit card on each property's
 * subscription. The property_id comes from the POST body and is verified
 * against the caller's org before any Stripe call.
 *
 * Behavior depends on what's already in place for the property:
 *
 *  - Subscription exists (created earlier and currently has no card,
 *    e.g. a legacy past_due sub being recovered) → mode=setup. The card
 *    from this checkout is attached to the org's Customer, then promoted
 *    via the webhook to *this property's* subscription
 *    default_payment_method.
 *
 *  - No subscription yet for the property → mode=subscription. Stripe
 *    creates the property's subscription AND collects its card in one
 *    step. quantity = 1 (a property is the billing unit). The one-time
 *    setup fee is added only if no other property in the org has been
 *    subscribed yet — subsequent properties don't pay setup again.
 *
 * The returned URL is opened in the same tab; success/cancel both bounce
 * back to /billing.
 */
export async function POST(request: Request) {
  const session = await requireOrgOwner()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const propertyId =
    typeof body === 'object' && body !== null && 'property_id' in body
      ? String((body as { property_id?: unknown }).property_id ?? '')
      : ''
  if (!propertyId) {
    return NextResponse.json(
      { error: 'property_id is required.' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const { data: property, error: propErr } = await admin
    .from('properties')
    .select('id, name, slug, org_id')
    .eq('id', propertyId)
    .maybeSingle()
  if (propErr) {
    return NextResponse.json({ error: propErr.message }, { status: 500 })
  }
  if (!property || property.org_id !== session.organization.id) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 })
  }

  // Use the request's own origin for the Stripe return URLs so the user
  // bounces back to the deployment they came from (preview or prod), not
  // to whatever NEXT_PUBLIC_SITE_URL happened to be baked in at build time.
  const siteUrl = new URL(request.url).origin
  const successUrl = `${siteUrl}/billing?stripe=success&property=${property.slug}`
  const cancelUrl = `${siteUrl}/billing?stripe=cancelled&property=${property.slug}`

  const customerId = await ensureStripeCustomer({
    orgId: session.organization.id,
    orgName: session.organization.name,
    ownerEmail: session.email,
  })

  const existing = await getSubscriptionForProperty(property.id)
  // Treat terminal-state rows as "no subscription" so a stale UI race
  // (clicking "Add card" on a canceled sub before the page revalidates)
  // doesn't try to attach a card to a dead subscription — Stripe would
  // reject the update and the customer would see a raw error. Falling
  // through here creates a fresh subscription instead.
  const hasLiveSubscription =
    Boolean(existing?.stripe_subscription_id) &&
    existing?.status !== 'canceled' &&
    existing?.status !== 'incomplete_expired'
  // Stripe rejections (no active price for our lookup key, customer
  // deleted on the Stripe side, line_items mismatch) used to surface as a
  // bare 500 with no body. Catch and translate so the UI can show
  // something actionable instead.
  try {
    if (hasLiveSubscription && existing?.stripe_subscription_id) {
      const checkout = await stripe().checkout.sessions.create({
        mode: 'setup',
        customer: customerId,
        // Omitting payment_method_types lets Checkout pick the
        // optimal set for the visitor's country automatically —
        // SEPA Direct Debit in the EU, iDEAL in NL, Bancontact in
        // BE, BLIK in PL, etc. Requires the methods to be enabled
        // in the Stripe Dashboard → Settings → Payment methods.
        // Cards are always available.
        // Stripe collects + validates the billing address in its
        // country-aware UI (UK shows postcode + county, JP shows
        // 〒 + 都道府県, etc.) and mirrors it to the Customer.
        billing_address_collection: 'required',
        // Mirror the Stripe-collected name + address back onto the
        // Customer so subsequent invoices use them.
        customer_update: { address: 'auto', name: 'auto' },
        // B2B customers (EU VAT, AU ABN, UK VAT, etc.) can enter
        // their tax ID for reverse-charge / exemption handling.
        // Stripe Tax uses it automatically when computing per-invoice
        // tax.
        tax_id_collection: { enabled: true },
        success_url: successUrl,
        cancel_url: cancelUrl,
        custom_fields: [autopayCustomField()],
        // The webhook reads these to know which subscription to attach the
        // new card to. property_id is the source of truth; subscription_id is
        // a convenience so the handler doesn't have to re-query.
        metadata: {
          org_id: session.organization.id,
          property_id: property.id,
          subscription_id: existing.stripe_subscription_id,
        },
      })
      return NextResponse.json({ url: checkout.url })
    }

    // Self-serve creation path. quantity is fixed at 1 because the billing
    // unit is a property. The setup fee is included on this property's
    // FIRST subscription only — a resubscribe after cancellation does
    // not re-charge. To waive setup fees entirely (e.g. as a promotion),
    // deactivate the hotelops_setup_fee Price in Stripe; the resolver
    // returns null and the fee is silently omitted.
    const stripeClient = stripe()
    const recurringPriceId = await requirePriceIdByLookupKey(
      stripeClient,
      HOTELOPS_PRICE_LOOKUP_KEYS.perPropertyMonthly,
    )

    let setupFeePriceId: string | null = null
    const alreadySubscribed = await propertyHasBeenSubscribed(property.id)
    if (!alreadySubscribed) {
      setupFeePriceId = await resolvePriceIdByLookupKey(
        stripeClient,
        HOTELOPS_PRICE_LOOKUP_KEYS.setupFee,
      )
    }

    // Inherit any org-level add-ons the customer has already enabled so
    // a property started via Checkout is billed correctly from day one.
    // Without this, a new property would skip add-on charges until the
    // reconciler attached the items on the next pass.
    const orgAddons = await resolveActiveOrgAddonPriceIds(
      stripeClient,
      session.organization.id,
    )

    const checkout = await stripeClient.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: customerId,
        line_items: [
          { price: recurringPriceId, quantity: 1 },
          ...(setupFeePriceId ? [{ price: setupFeePriceId, quantity: 1 }] : []),
          ...orgAddons.map((a) => ({ price: a.priceId, quantity: 1 })),
        ],
        // payment_method_types intentionally omitted so Checkout
        // shows the optimal set per visitor country (see above).
        billing_address_collection: 'required',
        customer_update: { address: 'auto', name: 'auto' },
        tax_id_collection: { enabled: true },
        custom_fields: [autopayCustomField()],
        subscription_data: {
          // Stripe caps Subscription.description at 500 chars; property.name
          // is a free-form text column so truncate defensively.
          description:
            `HotelOps subscription — ${property.name}`.slice(0, 500),
          metadata: {
            org_id: session.organization.id,
            property_id: property.id,
            property_slug: property.slug,
            app: 'hotelops',
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          org_id: session.organization.id,
          property_id: property.id,
        },
      },
      {
        // A double-click on "Start & add card" must not mint two distinct
        // Checkout sessions — if the user paid in both browser tabs Stripe
        // would create two subscriptions and charge two setup fees while
        // our webhook (upserting on property_id) would silently drop one.
        // Same property_id + same monthly price = same Checkout session for
        // the lifetime of Stripe's idempotency window (24h), which exceeds
        // a Checkout session's own expiry, so a stale URL is never returned.
        idempotencyKey: `setup-checkout:${property.id}:${recurringPriceId}`,
      },
    )
    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('[stripe] setup-checkout failed', err)
    const message =
      err instanceof Error ? err.message : 'Stripe checkout unavailable.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
