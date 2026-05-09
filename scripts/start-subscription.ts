/**
 * Start a Stripe subscription for an existing organization with a 14-day
 * trial. Use this once per tenant when admin-onboarding them — the customer
 * then sees a CTA on /billing to add their card before the trial ends.
 *
 * Usage:
 *   npx tsx scripts/start-subscription.ts \
 *     --org-slug=gc-hotel-group \
 *     [--price=price_XXXX]              # defaults to STRIPE_PRICE_ID env
 *     [--trial-days=14]
 *
 * Idempotent:
 *   - Reuses an existing Stripe Customer if one is already linked.
 *   - Refuses to create a second active subscription if one is already
 *     attached (prints the existing id and exits 0).
 *
 * Required env (read from .env.local locally; from secrets in CI):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   STRIPE_SECRET_KEY
 *   STRIPE_PRICE_ID                   (or pass --price)
 */

import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

loadEnv({ path: resolve(process.cwd(), '.env.local') })

const args = parseArgs(process.argv.slice(2))

const SUPABASE_URL = required('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE = required('SUPABASE_SERVICE_ROLE_KEY')
const STRIPE_SECRET = required('STRIPE_SECRET_KEY')
const PRICE_ID = args.price ?? required('STRIPE_PRICE_ID')

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const stripe = new Stripe(STRIPE_SECRET, {
  apiVersion: '2026-04-22.dahlia',
  typescript: true,
})

async function main() {
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', args.orgSlug)
    .maybeSingle()
  if (orgErr) throw orgErr
  if (!org) {
    console.error(`No organization with slug "${args.orgSlug}".`)
    process.exit(1)
  }

  const ownerEmail = await findOwnerEmail(org.id)

  const customerId = await ensureCustomer(org.id, org.name, ownerEmail)
  console.log(`Stripe customer: ${customerId}`)

  const existingSubId = await existingSubscriptionId(org.id)
  if (existingSubId) {
    console.log(
      `Subscription already exists for ${org.slug}: ${existingSubId}. Skipping.`,
    )
    return
  }

  const subscription = await stripe.subscriptions.create(
    {
      customer: customerId,
      items: [{ price: PRICE_ID }],
      trial_period_days: args.trialDays,
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      trial_settings: {
        end_behavior: { missing_payment_method: 'pause' },
      },
      metadata: { org_id: org.id, app: 'hotelops' },
    },
    { idempotencyKey: `subscription:${org.id}:${PRICE_ID}` },
  )
  console.log(
    `Subscription created: ${subscription.id} (status: ${subscription.status}, trial ends ${
      subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : 'n/a'
    })`,
  )

  await syncToDb(org.id, customerId, subscription)
  console.log(`Synced billing_subscriptions row.`)
  console.log(
    `\nDone. The customer can now add a card at /billing → "Add payment method".`,
  )
}

async function ensureCustomer(
  orgId: string,
  orgName: string,
  ownerEmail: string | null,
): Promise<string> {
  const { data } = await admin
    .from('billing_subscriptions')
    .select('stripe_customer_id')
    .eq('org_id', orgId)
    .maybeSingle()
  if (data?.stripe_customer_id) return data.stripe_customer_id

  const customer = await stripe.customers.create(
    {
      name: orgName,
      email: ownerEmail ?? undefined,
      metadata: { org_id: orgId, app: 'hotelops' },
    },
    { idempotencyKey: `customer:${orgId}` },
  )

  const { error } = await admin
    .from('billing_subscriptions')
    .upsert(
      {
        org_id: orgId,
        stripe_customer_id: customer.id,
        status: 'incomplete',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' },
    )
  if (error) throw error
  return customer.id
}

async function existingSubscriptionId(orgId: string): Promise<string | null> {
  const { data } = await admin
    .from('billing_subscriptions')
    .select('stripe_subscription_id, status')
    .eq('org_id', orgId)
    .maybeSingle()
  if (!data?.stripe_subscription_id) return null
  // Allow re-running if the previous attempt landed in a terminal state.
  if (data.status === 'canceled' || data.status === 'incomplete_expired') {
    return null
  }
  return data.stripe_subscription_id
}

async function syncToDb(
  orgId: string,
  customerId: string,
  subscription: Stripe.Subscription,
) {
  const item = subscription.items.data[0]
  const { error } = await admin.from('billing_subscriptions').upsert(
    {
      org_id: orgId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: item?.price.id ?? null,
      status: subscription.status,
      trial_end: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      current_period_start: item?.current_period_start
        ? new Date(item.current_period_start * 1000).toISOString()
        : null,
      current_period_end: item?.current_period_end
        ? new Date(item.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id' },
  )
  if (error) throw error
}

async function findOwnerEmail(orgId: string): Promise<string | null> {
  const { data: profiles } = await admin
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .eq('role', 'org_owner')
    .limit(1)
  const ownerId = profiles?.[0]?.id
  if (!ownerId) return null
  const { data } = await admin.auth.admin.getUserById(ownerId)
  return data.user?.email ?? null
}

type Args = {
  orgSlug: string
  price?: string
  trialDays: number
}

function parseArgs(raw: string[]): Args {
  const out: { orgSlug?: string; price?: string; trialDays?: number } = {}
  for (const arg of raw) {
    const eq = arg.indexOf('=')
    if (eq === -1) usage(`Unrecognized argument: ${arg}`)
    const key = arg.slice(0, eq).replace(/^--/, '')
    const value = arg.slice(eq + 1)
    if (key === 'org-slug') out.orgSlug = value
    else if (key === 'price') out.price = value
    else if (key === 'trial-days') {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 0 || n > 90) {
        usage('--trial-days must be an integer between 0 and 90')
      }
      out.trialDays = n
    } else usage(`Unrecognized argument: --${key}`)
  }
  if (!out.orgSlug) usage('Missing --org-slug')
  return { orgSlug: out.orgSlug!, price: out.price, trialDays: out.trialDays ?? 14 }
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return v
}

function usage(message: string): never {
  console.error(`\n${message}\n`)
  console.error(
    'Usage:\n  npx tsx scripts/start-subscription.ts \\\n' +
      '    --org-slug=<slug> \\\n' +
      '    [--price=price_XXXX] \\\n' +
      '    [--trial-days=14]\n',
  )
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
