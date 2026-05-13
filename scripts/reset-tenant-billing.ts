/**
 * One-shot operator script: wipe an org's billing state on both Stripe
 * and the HotelOps DB so they can re-onboard cleanly under the new
 * per-property subscription model.
 *
 * Use case: a legacy tenant (e.g. CG Hotel Group) accumulated org-level
 * Stripe subscriptions, open invoices, and `billing_subscriptions` rows
 * under the old quantity=N model. The per-property migration leaves
 * them in a half-migrated state — this script finishes the cleanup so
 * the next /billing visit reads as a brand-new tenant.
 *
 * WHAT THIS DOES (in order, against Stripe first then the DB):
 *
 *   1. Find the org by slug.
 *   2. Look up the Stripe Customer from organizations.stripe_customer_id
 *      AND from any billing_subscriptions rows for the org (the Stripe-
 *      side state is the source of truth, and may have orphans the DB
 *      doesn't know about).
 *   3. List every subscription on that Customer — active and otherwise —
 *      and immediately cancel each one (prorate:false, invoice_now:false).
 *      No refund for the current period; no new charges.
 *   4. List every open invoice (status `open` or `draft`) on that Customer
 *      and void it so the customer is not dunned for stale balances.
 *   5. Delete the org's `billing_subscriptions` rows.
 *   6. Reset organizations.setup_fee_charged_at to null so the next
 *      subscription this org creates re-claims the one-time setup fee.
 *      The Stripe Customer itself is PRESERVED (so saved cards, billing
 *      address, tax id, and Customer history survive).
 *
 * WHAT THIS DOES NOT DO:
 *   - Touch the `properties` table. Properties stay; their R2 files stay.
 *   - Touch `organizations.stripe_customer_id`. The Customer is reused.
 *   - Delete invoices that are already paid (those are immutable history).
 *   - Touch any other org's data.
 *
 * Usage:
 *   npm run reset:tenant-billing -- --org-slug=cg-hotel-group
 *     # dry-run; prints every cancel/void without executing
 *
 *   npm run reset:tenant-billing -- --org-slug=cg-hotel-group --apply
 *     # actually executes against Stripe + DB
 *
 *   npm run reset:tenant-billing -- --org-slug=cg-hotel-group --apply --hard
 *     # also deletes the Stripe Customer (use only if you truly want a
 *     # fresh Customer; this wipes saved cards, address, and tax id).
 *
 * Required env (same set as the app):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   STRIPE_SECRET_KEY
 */

import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: resolve(process.cwd(), '.env.local') })

type Args = {
  orgSlug: string | null
  apply: boolean
  hard: boolean
}

function parseArgs(): Args {
  const orgSlug =
    process.argv.find((a) => a.startsWith('--org-slug='))?.split('=')[1] ??
    null
  return {
    orgSlug,
    apply: process.argv.includes('--apply'),
    hard: process.argv.includes('--hard'),
  }
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing required env: ${name}`)
    process.exit(1)
  }
  return v
}

async function main() {
  const { orgSlug, apply, hard } = parseArgs()
  if (!orgSlug) {
    console.error(
      'Usage: npm run reset:tenant-billing -- --org-slug=<slug> [--apply] [--hard]',
    )
    process.exit(1)
  }

  // Lazy imports so dotenv loads first.
  const { createClient } = await import('@supabase/supabase-js')
  const { default: Stripe } = await import('stripe')

  const supabase = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )
  const stripe = new Stripe(required('STRIPE_SECRET_KEY'))

  console.log(`\n=== Reset tenant billing: ${orgSlug} ===`)
  console.log(
    `mode=${apply ? 'APPLY' : 'dry-run (re-run with --apply to execute)'}` +
      (apply && hard ? ' · HARD (will delete Stripe Customer)' : ''),
  )

  // 1. Find the org.
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, slug, name, stripe_customer_id, setup_fee_charged_at')
    .eq('slug', orgSlug)
    .maybeSingle()
  if (orgErr) throw orgErr
  if (!org) {
    console.error(`No organization with slug "${orgSlug}".`)
    process.exit(1)
  }
  console.log(`\nOrg: ${org.name} (${org.id})`)
  console.log(`  stripe_customer_id = ${org.stripe_customer_id ?? '(none)'}`)
  console.log(
    `  setup_fee_charged_at = ${org.setup_fee_charged_at ?? '(null)'}`,
  )

  // 2. Resolve every candidate Stripe Customer id for this org. Prefer the
  // org-level column, but also scan billing_subscriptions for rows whose
  // stripe_customer_id diverges (possible if a legacy flow created a
  // separate Customer that never got promoted to the org row).
  const { data: subRows, error: subErr } = await supabase
    .from('billing_subscriptions')
    .select('property_id, stripe_customer_id, stripe_subscription_id, status')
    .eq('org_id', org.id)
  if (subErr) throw subErr

  const customerIds = new Set<string>()
  if (org.stripe_customer_id) customerIds.add(org.stripe_customer_id)
  for (const r of subRows ?? []) {
    if (r.stripe_customer_id) customerIds.add(r.stripe_customer_id)
  }
  if (customerIds.size === 0) {
    console.log(
      '\nNo Stripe Customer associated with this org. Will only clear DB state.',
    )
  } else {
    console.log(`\nStripe Customers to process: ${[...customerIds].join(', ')}`)
  }

  // 3 + 4. For each Customer, cancel all subscriptions and void all open
  // invoices.
  let canceledSubs = 0
  let voidedInvoices = 0
  for (const customerId of customerIds) {
    console.log(`\n--- Customer ${customerId} ---`)

    // Subscriptions (all statuses — `all: true` returns canceled/expired
    // too, but those are no-ops on cancel and we want a full picture).
    const subs: Awaited<ReturnType<typeof stripe.subscriptions.list>>['data'] =
      []
    for await (const s of stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
    })) {
      subs.push(s)
    }
    if (subs.length === 0) {
      console.log('  (no subscriptions)')
    }
    for (const s of subs) {
      const alreadyEnded =
        s.status === 'canceled' || s.status === 'incomplete_expired'
      const verb = alreadyEnded ? 'skip  ' : 'cancel'
      console.log(
        `  ${verb}  ${s.id}  status=${s.status}  qty=${s.items.data[0]?.quantity ?? '?'}  ` +
          `price=${s.items.data[0]?.price?.id ?? '?'}`,
      )
      if (apply && !alreadyEnded) {
        await stripe.subscriptions.cancel(s.id, {
          invoice_now: false,
          prorate: false,
        })
        canceledSubs++
      } else if (!alreadyEnded) {
        canceledSubs++
      }
    }

    // Invoices: void everything that's open or draft (still pending or
    // collectible). Paid / void / uncollectible invoices are left alone
    // because they're immutable history.
    const invoices: Awaited<ReturnType<typeof stripe.invoices.list>>['data'] =
      []
    for await (const inv of stripe.invoices.list({
      customer: customerId,
      limit: 100,
    })) {
      invoices.push(inv)
    }
    const toVoid = invoices.filter(
      (i) => i.status === 'open' || i.status === 'draft',
    )
    if (toVoid.length === 0) {
      console.log('  (no open or draft invoices)')
    }
    for (const inv of toVoid) {
      console.log(
        `  void   ${inv.id}  status=${inv.status}  ` +
          `amount_due=${(inv.amount_due ?? 0) / 100} ${inv.currency?.toUpperCase()}`,
      )
      if (apply && inv.id) {
        if (inv.status === 'draft') {
          // draft invoices can't be voided; delete them instead.
          await stripe.invoices.del(inv.id)
        } else {
          await stripe.invoices.voidInvoice(inv.id)
        }
        voidedInvoices++
      } else {
        voidedInvoices++
      }
    }
  }

  // 5. Clear DB billing_subscriptions rows for this org.
  console.log(`\n--- DB cleanup ---`)
  console.log(
    `  delete  billing_subscriptions where org_id=${org.id}  (${subRows?.length ?? 0} rows)`,
  )
  if (apply) {
    const { error } = await supabase
      .from('billing_subscriptions')
      .delete()
      .eq('org_id', org.id)
    if (error) throw error
  }

  // 6. Reset org-level setup-fee claim and (optionally, with --hard) the
  // Customer id pointer.
  if (org.setup_fee_charged_at) {
    console.log(`  update  organizations.setup_fee_charged_at = NULL`)
    if (apply) {
      const { error } = await supabase
        .from('organizations')
        .update({ setup_fee_charged_at: null })
        .eq('id', org.id)
      if (error) throw error
    }
  }

  if (hard && customerIds.size > 0) {
    for (const customerId of customerIds) {
      console.log(`  delete  Stripe Customer ${customerId}`)
      if (apply) {
        await stripe.customers.del(customerId)
      }
    }
    if (org.stripe_customer_id) {
      console.log(`  update  organizations.stripe_customer_id = NULL`)
      if (apply) {
        const { error } = await supabase
          .from('organizations')
          .update({ stripe_customer_id: null })
          .eq('id', org.id)
        if (error) throw error
      }
    }
  }

  // Summary.
  console.log(`\n=== Summary ===`)
  console.log(`  Subscriptions cancelled: ${canceledSubs}`)
  console.log(`  Invoices voided/deleted: ${voidedInvoices}`)
  console.log(`  DB rows cleared:         ${subRows?.length ?? 0}`)
  if (!apply) {
    console.log(`\nThis was a dry run. Re-run with --apply to execute.`)
  } else {
    console.log(
      `\nDone. The org can now visit /billing and start subscriptions ` +
        `per-property under the new model.${
          hard ? ' Saved cards have been wiped (--hard).' : ''
        }`,
    )
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err)
  process.exit(1)
})
