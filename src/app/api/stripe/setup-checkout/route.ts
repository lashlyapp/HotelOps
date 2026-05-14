import { NextResponse } from 'next/server'
import { requireOrgOwner } from '@/lib/auth/session'
import { stripe } from '@/lib/stripe/client'
import {
  HOTELOPS_PRICE_LOOKUP_KEYS,
  requirePriceIdByLookupKey,
  resolvePriceIdByLookupKey,
} from '@/lib/stripe/prices'
import {
  ensureStripeCustomer,
  getSubscriptionForProperty,
  propertyHasBeenSubscribed,
} from '@/lib/stripe/subscriptions'
import { createAdminClient } from '@/lib/supabase/admin'

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
 *  - Subscription exists (admin-created, or self-started earlier) →
 *    mode=setup. The card from this checkout is attached to the org's
 *    Customer, then promoted via the webhook to *this property's*
 *    subscription default_payment_method and the subscription is flipped
 *    from send_invoice to charge_automatically.
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
  if (hasLiveSubscription && existing?.stripe_subscription_id) {
    const checkout = await stripe().checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      payment_method_types: ['card'],
      success_url: successUrl,
      cancel_url: cancelUrl,
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

  const checkout = await stripeClient.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [
      { price: recurringPriceId, quantity: 1 },
      ...(setupFeePriceId ? [{ price: setupFeePriceId, quantity: 1 }] : []),
    ],
    subscription_data: {
      description: `HotelOps subscription — ${property.name}`,
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
  })
  return NextResponse.json({ url: checkout.url })
}
