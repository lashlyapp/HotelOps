/**
 * Start a per-property Stripe subscription for an existing organization. The
 * subscription is active and billable from day one with a 14-day window for
 * the customer to attach a payment method (collection_method=send_invoice,
 * days_until_due=14). An optional one-time setup fee is tacked onto the
 * first invoice when a Price with the `hotelops_setup_fee` lookup key
 * exists; pass --setup-fee=price_XXXX to override.
 *
 * Prices are resolved from Stripe at runtime via lookup keys, NOT env vars,
 * so updating pricing only requires creating a new Price in the Dashboard
 * and transferring the lookup key onto it.
 *
 * Usage:
 *   npx tsx scripts/start-subscription.ts \
 *     --org-slug=cg-hotel-group \
 *     [--price=price_XXXX]              # override; defaults to lookup_key=hotelops_per_property_monthly
 *     [--quantity=N]                    # defaults to org's property count
 *     [--setup-fee=price_XXXX]          # override; defaults to lookup_key=hotelops_setup_fee (or none)
 *     [--grace-days=14]
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
 */

import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import {
  HOTELOPS_PRICE_LOOKUP_KEYS,
  requirePriceIdByLookupKey,
  resolvePriceIdByLookupKey,
} from '../src/lib/stripe/prices'

loadEnv({ path: resolve(process.cwd(), '.env.local') })

const args = parseArgs(process.argv.slice(2))

const SUPABASE_URL = required('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE = required('SUPABASE_SERVICE_ROLE_KEY')
const STRIPE_SECRET = required('STRIPE_SECRET_KEY')

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

  const priceId =
    args.price ??
    (await requirePriceIdByLookupKey(
      stripe,
      HOTELOPS_PRICE_LOOKUP_KEYS.perPropertyMonthly,
    ))
  const setupFeePriceId =
    args.setupFee ??
    (await resolvePriceIdByLookupKey(
      stripe,
      HOTELOPS_PRICE_LOOKUP_KEYS.setupFee,
    ))

  const propertyCount = await countProperties(org.id)
  const quantity = args.quantity ?? Math.max(1, propertyCount)
  console.log(
    `Org: ${org.name} (${org.id}) — ${propertyCount} propert${propertyCount === 1 ? 'y' : 'ies'} on file; subscribing quantity=${quantity}.`,
  )
  console.log(`Recurring price: ${priceId}`)

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

  const params: Stripe.SubscriptionCreateParams = {
    customer: customerId,
    items: [{ price: priceId, quantity }],
    collection_method: 'send_invoice',
    days_until_due: args.graceDays,
    metadata: { org_id: org.id, app: 'hotelops' },
  }
  if (setupFeePriceId) {
    params.add_invoice_items = [{ price: setupFeePriceId, quantity: 1 }]
    console.log(`Setup fee: ${setupFeePriceId} on first invoice.`)
  }

  const subscription = await stripe.subscriptions.create(params, {
    idempotencyKey: `subscription:${org.id}:${priceId}`,
  })
  console.log(
    `Subscription created: ${subscription.id} (status: ${subscription.status})`,
  )

  await syncToDb(org.id, customerId, subscription, args.graceDays)

  const dueAt = new Date(Date.now() + args.graceDays * 24 * 60 * 60 * 1000)
  console.log(`Synced billing_subscriptions row.`)
  console.log(
    `Cooling period ends ${dueAt.toISOString()} — customer must attach a card by then via /billing → "Add payment method".`,
  )
}

async function countProperties(orgId: string): Promise<number> {
  const { count, error } = await admin
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
  if (error) throw error
  return count ?? 0
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
  graceDays: number,
) {
  const item = subscription.items.data[0]
  const price = item?.price
  const dueAt = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000)

  const { error } = await admin.from('billing_subscriptions').upsert(
    {
      org_id: orgId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: price?.id ?? null,
      status: subscription.status,
      payment_method_due_at: dueAt.toISOString(),
      current_period_start: item?.current_period_start
        ? new Date(item.current_period_start * 1000).toISOString()
        : null,
      current_period_end: item?.current_period_end
        ? new Date(item.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      unit_amount_cents: price?.unit_amount ?? null,
      quantity: item?.quantity ?? 1,
      currency: price?.currency ?? 'usd',
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
  quantity?: number
  setupFee?: string
  graceDays: number
}

function parseArgs(raw: string[]): Args {
  const out: {
    orgSlug?: string
    price?: string
    quantity?: number
    setupFee?: string
    graceDays?: number
  } = {}
  for (const arg of raw) {
    const eq = arg.indexOf('=')
    if (eq === -1) usage(`Unrecognized argument: ${arg}`)
    const key = arg.slice(0, eq).replace(/^--/, '')
    const value = arg.slice(eq + 1)
    if (key === 'org-slug') out.orgSlug = value
    else if (key === 'price') out.price = value
    else if (key === 'setup-fee') out.setupFee = value
    else if (key === 'quantity') {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1) usage('--quantity must be a positive integer')
      out.quantity = n
    } else if (key === 'grace-days') {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 0 || n > 90) {
        usage('--grace-days must be an integer between 0 and 90')
      }
      out.graceDays = n
    } else usage(`Unrecognized argument: --${key}`)
  }
  if (!out.orgSlug) usage('Missing --org-slug')
  return {
    orgSlug: out.orgSlug!,
    price: out.price,
    quantity: out.quantity,
    setupFee: out.setupFee,
    graceDays: out.graceDays ?? 14,
  }
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
      '    [--quantity=N] \\\n' +
      '    [--setup-fee=price_XXXX] \\\n' +
      '    [--grace-days=14]\n',
  )
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
