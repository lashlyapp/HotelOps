import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { stripe, stripeWebhookSecret } from '@/lib/stripe/client'
import { syncSubscriptionToDb } from '@/lib/stripe/subscriptions'
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
    event = stripe().webhooks.constructEvent(rawBody, sig, stripeWebhookSecret())
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

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed': {
      const subscription = event.data.object as Stripe.Subscription
      const orgId = orgIdFromMetadata(subscription.metadata)
      if (!orgId) return
      await syncSubscriptionToDb(orgId, subscription)
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
 * but no subscription attached. Promote that pm to:
 *   1. The customer's default invoice payment method;
 *   2. The subscription's default_payment_method;
 * and flip the subscription from `send_invoice` to `charge_automatically` so
 * future (recurring) invoices auto-charge. The currently-open first invoice
 * is left alone — it's already listed in the billing UI for the customer to
 * pay through their preferred channel.
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
  if (!subscriptionId || !orgId) return

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

  const customerId =
    typeof setupIntent.customer === 'string'
      ? setupIntent.customer
      : setupIntent.customer?.id
  if (customerId) {
    await stripe().customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    })
  }

  const subscription = await stripe().subscriptions.update(subscriptionId, {
    default_payment_method: paymentMethodId,
    collection_method: 'charge_automatically',
  })

  // Card on file → grace period no longer applies. Clear the deadline so the
  // billing UI stops showing the "X days remaining" countdown.
  await syncSubscriptionToDb(orgId, subscription, { paymentMethodDueAt: null })
}

function orgIdFromMetadata(
  metadata: Stripe.Metadata | null | undefined,
): string | null {
  if (!metadata) return null
  if (metadata.app && metadata.app !== 'hotelops') return null
  return metadata.org_id ?? null
}
