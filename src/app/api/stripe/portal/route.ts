import { NextResponse } from 'next/server'
import { requireOrgOwner } from '@/lib/auth/session'
import { stripe } from '@/lib/stripe/client'
import { getStripeCustomerForOrg } from '@/lib/stripe/subscriptions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Owner-only: open the Stripe Billing Portal for this org's customer. From
 * there the customer can update their card, view invoices, and cancel. The
 * portal is configured in the Stripe Dashboard.
 */
export async function POST() {
  const session = await requireOrgOwner()
  const customerId = await getStripeCustomerForOrg(session.organization.id)
  if (!customerId) {
    return NextResponse.json(
      { error: 'No billing customer for this org yet.' },
      { status: 400 },
    )
  }

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '')

  const portal = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${siteUrl}/billing`,
  })

  return NextResponse.json({ url: portal.url })
}
