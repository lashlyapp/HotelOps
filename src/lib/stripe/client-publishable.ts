'use client'

import { loadStripe, type Stripe } from '@stripe/stripe-js'

/**
 * Client-side Stripe handle for Stripe Elements (Address Element,
 * Payment Element, etc.). Lazy singleton: `loadStripe` is asynchronous
 * because the Stripe.js script is fetched from Stripe's CDN on first
 * use, so subsequent components can reuse the same Promise instead of
 * triggering another script load.
 *
 * The publishable key is intentionally public — it's safe to ship in
 * the browser bundle (it's how Stripe distinguishes API calls that
 * can be made from the browser from API calls that need the secret
 * key). Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in Vercel env vars
 * pointing at the same Stripe account as STRIPE_SECRET_KEY.
 *
 * Returns null when the env var is unset (local dev without Stripe
 * configured) so the consuming component can show a clear "Stripe
 * not configured" notice rather than crashing.
 */
let cached: Promise<Stripe | null> | null = null

export function getStripeJs(): Promise<Stripe | null> {
  if (cached) return cached
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!key) {
    console.warn(
      '[stripe] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set; ' +
        'Elements components will fall back to a degraded UI.',
    )
    cached = Promise.resolve(null)
    return cached
  }
  cached = loadStripe(key)
  return cached
}
