import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe/client'
import {
  payOpenInvoiceForSubscription,
  syncSubscriptionToDb,
} from '@/lib/stripe/subscriptions'
import {
  orgIdFromMetadata,
  parseStripeEvent,
  propertyIdFromMetadata,
} from '@/lib/stripe/webhook'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stripe webhook receiver. Every event is logged in stripe_events first so
 * redeliveries are no-ops, and only customer.subscription.* /
 * checkout.session.completed events drive state changes.
 *
 * This endpoint must be configured under the HotelOps Stripe account → only
 * subscribe to events we handle. We also filter incoming events by the
 * `app: "hotelops"` metadata as a defense-in-depth check, in case the same
 * webhook URL is ever pointed at a Lashly account by mistake.
 */
export async function POST(request: NextRequest) {
  const sig = request.headers.get('stripe-signature')
  if (!sig) {
    return new NextResponse('missing signature', { status: 400 })
  }

  const rawBody = await request.text()
  let event: Stripe.Event
  try {
    event = parseStripeEvent(rawBody, sig)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid signature'
    return new NextResponse(`webhook error: ${message}`, { status: 400 })
  }

  // Idempotency: if we've seen this event id before, ack and bail.
  const admin = createAdminClient()
  const { error: insertErr } = await admin.from('stripe_events').insert({
    id: event.id,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
  })
  if (insertErr && insertErr.code !== '23505') {
    console.error('[stripe-webhook] event log insert failed', insertErr)
    return new NextResponse('event log failed', { status: 500 })
  }
  if (insertErr?.code === '23505') {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    await handleEvent(event)
  } catch (err) {
    console.error('[stripe-webhook] handler failed', event.type, err)
    // 500 so Stripe retries; the idempotency guard above won't double-process.
    return new NextResponse('handler failed', { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function resolvePropertyIdBySubscription(
  subscriptionId: string,
): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('billing_subscriptions')
    .select('property_id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle()
  return data?.property_id ?? null
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed': {
      const subscription = event.data.object as Stripe.Subscription
      const orgId = orgIdFromMetadata(subscription.metadata)
      const propertyIdFromMeta = propertyIdFromMetadata(subscription.metadata)
      if (!orgId) return
      // Legacy subscriptions predating per-property billing have org_id
      // but no property_id in metadata. Auto-heal by looking up the
      // billing_subscriptions row we backfilled during migration, keyed
      // by stripe_subscription_id (which is unique). This recovers
      // routing without admin intervention; a warning is logged so
      // operators can backfill the Stripe-side metadata later.
      let propertyId = propertyIdFromMeta
      if (!propertyId) {
        propertyId = await resolvePropertyIdBySubscription(subscription.id)
        if (!propertyId) {
          console.warn(
            `[stripe-webhook] subscription ${subscription.id} has no ` +
              `property_id metadata and no matching billing_subscriptions ` +
              `row; dropping event ${event.type}.`,
          )
          return
        }
        console.warn(
          `[stripe-webhook] healed legacy subscription ${subscription.id} ` +
            `to property ${propertyId}; backfill its Stripe metadata.`,
        )
      }
      await syncSubscriptionToDb(propertyId, orgId, subscription)
      return
    }

    case 'checkout.session.completed': {
      const checkoutSession = event.data.object as Stripe.Checkout.Session
      await handleCheckoutCompleted(checkoutSession)
      return
    }

    default:
      // Unhandled type — already logged in stripe_events.
      return
  }
}

/**
 * Setup-mode Checkout finishes with a Setup Intent that has a payment method
 * but no subscription attached. Attach the pm to this *property's*
 * subscription only — explicitly NOT to the org-level Customer's
 * invoice_settings.default_payment_method, because that's shared across all
 * of the org's per-property subscriptions and would silently flip every
 * other property's card too. Each property keeps its own card.
 *
 * Flip the subscription from `send_invoice` to `charge_automatically` so
 * future (recurring) invoices auto-charge. Then pay any open first invoice
 * with the just-attached card — if we skipped this the act of "adding a
 * card" wouldn't actually settle the outstanding charge and the customer
 * would silently slip into past_due 14 days later. Best-effort: a decline
 * leaves the invoice open and Stripe's normal dunning takes over.
 */
async function handleCheckoutCompleted(
  checkoutSession: Stripe.Checkout.Session,
): Promise<void> {
  if (checkoutSession.mode === 'subscription') {
    // The subscription.created event will sync DB state; nothing to do here.
    return
  }
  if (checkoutSession.mode !== 'setup') return

  const subscriptionId = checkoutSession.metadata?.subscription_id
  const orgId = checkoutSession.metadata?.org_id
  let propertyId = checkoutSession.metadata?.property_id
  if (!subscriptionId || !orgId) return
  if (!propertyId) {
    // Legacy setup-mode checkout from before property_id was stamped on
    // the checkout session metadata. Recover via subscription lookup.
    const resolved = await resolvePropertyIdBySubscription(subscriptionId)
    if (!resolved) return
    propertyId = resolved
  }

  const setupIntentId =
    typeof checkoutSession.setup_intent === 'string'
      ? checkoutSession.setup_intent
      : checkoutSession.setup_intent?.id
  if (!setupIntentId) return

  const setupIntent = await stripe().setupIntents.retrieve(setupIntentId)
  const paymentMethodId =
    typeof setupIntent.payment_method === 'string'
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id
  if (!paymentMethodId) return

  // Deliberately do NOT update the Customer's invoice_settings here — the
  // Customer is shared across the org's per-property subscriptions and
  // touching its default payment method would change every property's
  // default. The pm only attaches to this one subscription.
  await stripe().subscriptions.update(subscriptionId, {
    default_payment_method: paymentMethodId,
    collection_method: 'charge_automatically',
  })

  await payOpenInvoiceForSubscription(subscriptionId, paymentMethodId)

  // Re-fetch so the DB write reflects post-payment status (incomplete →
  // active when the just-attached card cleared the open invoice). Without
  // this we'd write the pre-pay snapshot and the customer would see a
  // brief "incomplete" badge until the trailing subscription.updated
  // webhook caught up.
  const fresh = await stripe().subscriptions.retrieve(subscriptionId)

  // Card on file → grace period no longer applies. Clear the deadline so the
  // billing UI stops showing the "X days remaining" countdown.
  await syncSubscriptionToDb(propertyId, orgId, fresh, {
    paymentMethodDueAt: null,
  })
}

