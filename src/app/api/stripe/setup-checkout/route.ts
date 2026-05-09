import { NextResponse } from 'next/server'
import { requireOrgOwner } from '@/lib/auth/session'
import { stripe, stripePriceId } from '@/lib/stripe/client'
import { ensureStripeCustomer, getSubscriptionForOrg } from '@/lib/stripe/subscriptions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Owner-only: create a Stripe Checkout session that the customer uses to save
 * a card. We pick the mode based on whether a subscription already exists:
 *
 *  - Subscription exists (admin-created with 14-day trial) → mode=setup. The
 *    saved card is attached to the customer, then promoted to the
 *    subscription's default_payment_method via the webhook so it's used when
 *    the trial ends.
 *
 *  - No subscription yet → mode=subscription. Stripe creates the subscription
 *    AND collects the card in one step. (Used if the org self-onboards
 *    instead of being admin-onboarded.)
 *
 * The returned URL is opened in the same tab; success/cancel both bounce back
 * to /billing where the webhook will have updated state by the time the user
 * lands (or shortly after).
 */
export async function POST() {
  const session = await requireOrgOwner()
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '')

  const customerId = await ensureStripeCustomer({
    orgId: session.organization.id,
    orgName: session.organization.name,
    ownerEmail: session.email,
  })

  const subscription = await getSubscriptionForOrg(session.organization.id)
  const successUrl = `${siteUrl}/billing?stripe=success`
  const cancelUrl = `${siteUrl}/billing?stripe=cancelled`

  if (subscription?.stripe_subscription_id) {
    const checkout = await stripe().checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      payment_method_types: ['card'],
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Pass the subscription id forward so the webhook knows which sub to
      // attach the resulting payment method to.
      metadata: {
        org_id: session.organization.id,
        subscription_id: subscription.stripe_subscription_id,
      },
    })
    return NextResponse.json({ url: checkout.url })
  }

  const checkout = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: stripePriceId(), quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      trial_settings: {
        end_behavior: { missing_payment_method: 'pause' },
      },
      metadata: { org_id: session.organization.id, app: 'hotelops' },
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { org_id: session.organization.id },
  })
  return NextResponse.json({ url: checkout.url })
}
