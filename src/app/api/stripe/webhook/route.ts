import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe/client'
import {
  payOpenInvoiceForSubscription,
  syncSubscriptionToDb,
} from '@/lib/stripe/subscriptions'
import {
  buildPropertyMemo,
  orgIdFromMetadata,
  parseStripeEvent,
  propertyIdFromMetadata,
  subscriptionIdFromInvoice,
} from '@/lib/stripe/webhook'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stripe webhook receiver. Every event is logged in stripe_events first so
 * redeliveries are no-ops. State changes are driven by
 * customer.subscription.* and checkout.session.completed; invoice.created
 * and invoice.finalized are used to stamp the property identity onto each
 * invoice so customers can tell which property a charge belongs to.
 *
 * This endpoint must be configured under the HotelOps Stripe account →
 * only subscribe to events we handle. Required event types:
 *   customer.subscription.created / updated / deleted / paused / resumed
 *   checkout.session.completed
 *   invoice.created
 *   invoice.finalized
 * We also filter incoming events by the `app: "hotelops"` metadata as a
 * defense-in-depth check, in case the same webhook URL is ever pointed
 * at a Lashly account by mistake.
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

    case 'invoice.created':
    case 'invoice.finalized': {
      const invoice = event.data.object as Stripe.Invoice
      await stampPropertyOnInvoice(invoice)
      return
    }

    default:
      // Unhandled type — already logged in stripe_events.
      return
  }
}

/**
 * Read the customer's response to our "make this the default for
 * auto-pay?" custom_field on Checkout. Returns true only when the
 * dropdown's value is exactly 'yes' — any other value (including
 * absence of the field on a legacy Checkout session) is treated as
 * no, so we never auto-elevate a card by accident.
 */
function shouldMakeAutopayDefault(
  checkoutSession: Stripe.Checkout.Session,
): boolean {
  const field = checkoutSession.custom_fields?.find(
    (f) => f.key === 'autopaydefault',
  )
  return field?.dropdown?.value === 'yes'
}

/**
 * Promote a payment method to the org's Customer-level default so
 * subsequent property creations auto-charge it. Best-effort: failures
 * don't break the surrounding card-attach flow, but they ARE logged at
 * error level (not warn) because the customer just opted in via the
 * autopaydefault dropdown — silently dropping that promise is a
 * disappointment we want operators to notice and investigate.
 *
 * Includes the Stripe-side context (customer + PM ids, error type) so
 * the log is actionable: a deleted/detached PM is benign retry noise,
 * an invalid_request on customer.update points at a Stripe-side state
 * mismatch worth fixing.
 */
async function setCustomerAutopayDefault(
  customerId: string,
  paymentMethodId: string,
): Promise<void> {
  try {
    await stripe().customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stripeType = (err as { type?: string } | null)?.type ?? 'unknown'
    console.error(
      '[stripe-webhook] setCustomerAutopayDefault failed',
      {
        customerId,
        paymentMethodId,
        stripeErrorType: stripeType,
        message,
      },
    )
  }
}

/**
 * Setup-mode Checkout finishes with a Setup Intent that has a payment method
 * but no subscription attached. Subscription-mode Checkout finishes with the
 * subscription already created and the card already attached as that
 * subscription's default — Stripe has charged the first invoice during the
 * Checkout flow.
 *
 * For setup-mode we:
 *   - Attach the new card to this property's subscription specifically
 *     (NOT to the Customer's invoice_settings by default — each property
 *     keeps its own per-subscription default card).
 *   - Pay any open invoice with the new card so the act of "adding a
 *     card" actually settles any outstanding charge (e.g. a past_due
 *     invoice the customer is now fixing).
 *
 * For BOTH modes, if the customer answered "yes" to the autopay_default
 * custom_field, we promote the card to the Customer.invoice_settings
 * default so subsequent property creations can auto-charge it. We never
 * silently promote a card — the customer has to explicitly opt in via
 * that prompt during Checkout.
 */
async function handleCheckoutCompleted(
  checkoutSession: Stripe.Checkout.Session,
): Promise<void> {
  if (checkoutSession.mode === 'subscription') {
    await handleSubscriptionModeCompleted(checkoutSession)
    return
  }
  if (checkoutSession.mode !== 'setup') return
  await handleSetupModeCompleted(checkoutSession)
}

async function handleSubscriptionModeCompleted(
  checkoutSession: Stripe.Checkout.Session,
): Promise<void> {
  // The subscription.created event syncs DB state; the only thing we do
  // here is honor the autopay-default opt-in by promoting the freshly
  // attached card to the Customer's invoice_settings default.
  if (!shouldMakeAutopayDefault(checkoutSession)) return
  const customerId =
    typeof checkoutSession.customer === 'string'
      ? checkoutSession.customer
      : checkoutSession.customer?.id
  const subscriptionId =
    typeof checkoutSession.subscription === 'string'
      ? checkoutSession.subscription
      : checkoutSession.subscription?.id
  if (!customerId || !subscriptionId) return

  // The subscription Stripe just created has the entered card as its
  // default_payment_method. Pull that PM id and promote it.
  const sub = await stripe().subscriptions.retrieve(subscriptionId)
  const pmId =
    typeof sub.default_payment_method === 'string'
      ? sub.default_payment_method
      : sub.default_payment_method?.id
  if (!pmId) return
  await setCustomerAutopayDefault(customerId, pmId)
}

async function handleSetupModeCompleted(
  checkoutSession: Stripe.Checkout.Session,
): Promise<void> {
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

  // Attach the pm to THIS subscription only. Customer-level default is
  // only touched below when the customer explicitly opted in via the
  // autopay_default custom_field — otherwise the Customer's default
  // stays as-is (so it doesn't silently flip out from under other subs).
  await stripe().subscriptions.update(subscriptionId, {
    default_payment_method: paymentMethodId,
  })

  await payOpenInvoiceForSubscription(subscriptionId, paymentMethodId)

  if (shouldMakeAutopayDefault(checkoutSession)) {
    const customerId =
      typeof checkoutSession.customer === 'string'
        ? checkoutSession.customer
        : checkoutSession.customer?.id
    if (customerId) await setCustomerAutopayDefault(customerId, paymentMethodId)
  }

  // Re-fetch so the DB write reflects post-payment status (incomplete →
  // active when the just-attached card cleared the open invoice). Without
  // this we'd write the pre-pay snapshot and the customer would see a
  // brief "incomplete" badge until the trailing subscription.updated
  // webhook caught up.
  const fresh = await stripe().subscriptions.retrieve(subscriptionId)
  await syncSubscriptionToDb(propertyId, orgId, fresh)
}

/**
 * Tag a freshly created (or finalized) invoice with the property it bills
 * for. Without this the rendered Stripe invoice only shows generic product
 * names ("Per Property Monthly", "Onboarding Fee") and a customer with
 * multiple properties can't tell which invoice belongs to which property.
 *
 * Stripe's "Bill to" block is owned by the Customer record and there's
 * one Customer per org, so we can't redirect "Bill to" at the property
 * without restructuring billing. Instead we put property identity on
 * the invoice via two surfaces Stripe DOES expose per-invoice:
 *   - `custom_fields`: a labeled "Property: <name>" pair rendered in
 *     the invoice header (value capped at 30 chars).
 *   - `description`: a multi-line memo with the property's name and
 *     postal address, rendered prominently under the header.
 *
 * The org continues to appear as the Customer ("Bill to") — that's the
 * informational role for the org per the product decision.
 *
 * We listen on both `invoice.created` (draft) and `invoice.finalized`
 * (open) because both states accept these updates, so we still tag the
 * invoice if the earlier event was missed.
 *
 * Best-effort: a failure here must not 500 the webhook (Stripe would
 * retry and we'd loop). Skip silently for invoices unrelated to a
 * property subscription (manual invoices, tests, etc.).
 */
async function stampPropertyOnInvoice(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.id) return
  // Once finalized-and-paid (or void/uncollectible) Stripe rejects updates
  // to custom_fields/description; don't fight the state machine.
  if (invoice.status && invoice.status !== 'draft' && invoice.status !== 'open') {
    return
  }
  // Skip if a redelivery already tagged this invoice.
  if (invoice.custom_fields?.some((f) => f.name === 'Property')) return

  const subscriptionId = subscriptionIdFromInvoice(invoice)
  if (!subscriptionId) return

  const admin = createAdminClient()
  const { data: subRow } = await admin
    .from('billing_subscriptions')
    .select('property_id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle()
  if (!subRow?.property_id) return
  const { data: property } = await admin
    .from('properties')
    .select(
      'name, address_line1, address_line2, city, state, postal_code, country, email',
    )
    .eq('id', subRow.property_id)
    .maybeSingle()
  if (!property?.name) return

  // Stripe limits invoice custom_fields values to 30 characters.
  const value = property.name.slice(0, 30)
  // And invoice.description (the memo block) to 1500 characters. The
  // address fields are user-edited strings so guard defensively.
  const memo = buildPropertyMemo(property).slice(0, 1500)

  try {
    await stripe().invoices.update(invoice.id, {
      custom_fields: [{ name: 'Property', value }],
      description: memo,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(
      '[stripe-webhook] stampPropertyOnInvoice failed',
      { invoiceId: invoice.id, message },
    )
  }
}


