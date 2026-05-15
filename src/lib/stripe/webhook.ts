import 'server-only'
import type Stripe from 'stripe'
import { stripe, stripeWebhookSecret } from './client'

/**
 * Verify a Stripe webhook payload's signature and return the parsed Event.
 * Wrapper that lets tests stub the secret without touching env globals.
 */
export function parseStripeEvent(
  body: string,
  signature: string,
  secret: string = stripeWebhookSecret(),
): Stripe.Event {
  return stripe().webhooks.constructEvent(body, signature, secret)
}

/**
 * Extract our org_id from Stripe object metadata, gated on the `app` tag so
 * a webhook from another HotelOps-org Stripe account (or, more importantly,
 * a misrouted Lashly webhook) is rejected before any DB writes happen.
 */
export function orgIdFromMetadata(
  metadata: Stripe.Metadata | null | undefined,
): string | null {
  if (!metadata) return null
  if (metadata.app && metadata.app !== 'hotelops') return null
  return metadata.org_id ?? null
}

/**
 * Extract our property_id from Stripe metadata. Same `app` tag gate as
 * orgIdFromMetadata. Returns null for subscriptions created before
 * per-property billing — those are ignored by the webhook since they
 * can't be reconciled against the new property-keyed schema.
 */
export function propertyIdFromMetadata(
  metadata: Stripe.Metadata | null | undefined,
): string | null {
  if (!metadata) return null
  if (metadata.app && metadata.app !== 'hotelops') return null
  return metadata.property_id ?? null
}

/**
 * Pull the subscription id out of an Invoice. Stripe represents this on
 * `Invoice.parent.subscription_details.subscription`; older SDK shapes
 * exposed it as a sibling `subscription` field but we standardized on
 * the parent-relation shape in this codebase. Returns null for one-off
 * invoices that aren't backed by a subscription.
 */
export function subscriptionIdFromInvoice(
  inv: Stripe.Invoice,
): string | null {
  const parent = inv.parent
  if (parent?.type === 'subscription_details') {
    const ref = parent.subscription_details?.subscription
    if (typeof ref === 'string') return ref
    if (ref && typeof ref === 'object') return ref.id ?? null
  }
  return null
}

export type PropertyMemoInput = {
  name: string
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  email: string | null
}

/**
 * Format the property's identity + postal address as a multi-line memo
 * for `Invoice.description`. We render whatever fields are populated;
 * the address columns are all nullable except country (defaults to "US"),
 * so a property with no address still gets at least the name as a memo.
 *
 * The output is what the customer sees on the invoice as a memo block,
 * so the goal is human readability — not machine parsing.
 */
export function buildPropertyMemo(p: PropertyMemoInput): string {
  const lines: string[] = [`For property: ${p.name}`]
  if (p.address_line1) lines.push(p.address_line1)
  if (p.address_line2) lines.push(p.address_line2)
  const cityState = [p.city, p.state].filter(Boolean).join(', ')
  const cityStatePostal = [cityState, p.postal_code].filter(Boolean).join(' ')
  if (cityStatePostal) lines.push(cityStatePostal)
  if (p.country) lines.push(p.country)
  if (p.email) lines.push(p.email)
  return lines.join('\n')
}
