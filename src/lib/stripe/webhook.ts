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
