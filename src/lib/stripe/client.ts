import 'server-only'
import Stripe from 'stripe'

let cached: Stripe | null = null

/**
 * Lazy singleton — instantiating Stripe at module import time would crash
 * the build on Vercel preview deployments that don't have STRIPE_SECRET_KEY
 * set. Callers (route handlers, server actions, scripts) all run at request
 * time after env is loaded.
 */
export function stripe(): Stripe {
  if (cached) return cached
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }
  cached = new Stripe(key, {
    // Pin the API version so behavior doesn't shift under us when Stripe
    // rolls a new default.
    apiVersion: '2026-04-22.dahlia',
    typescript: true,
    appInfo: { name: 'HotelOps', url: 'https://app.myhotelops.com' },
  })
  return cached
}

export function stripeWebhookSecret(): string {
  const v = process.env.STRIPE_WEBHOOK_SECRET
  if (!v) throw new Error('STRIPE_WEBHOOK_SECRET is not set')
  return v
}
