/**
 * CLI wrapper around lib/billing/reset-tenant.ts. Same operation that
 * the admin UI's "Reset billing" panel runs, exposed as a script for
 * cases where running it from an admin terminal is preferable to
 * clicking through the UI (e.g. when SSO/sessions are unavailable or
 * for batch operations).
 *
 * Usage:
 *   npm run reset:tenant-billing -- --org-slug=cg-hotel-group
 *     # dry-run; prints exactly what an actual reset would do.
 *
 *   npm run reset:tenant-billing -- --org-slug=cg-hotel-group --apply
 *     # actually executes against Stripe + DB.
 *
 *   npm run reset:tenant-billing -- --org-slug=cg-hotel-group --apply --hard
 *     # additionally deletes the Stripe Customer (wipes saved cards).
 *
 * Required env:
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

async function main() {
  const { orgSlug, apply, hard } = parseArgs()
  if (!orgSlug) {
    console.error(
      'Usage: npm run reset:tenant-billing -- --org-slug=<slug> [--apply] [--hard]',
    )
    process.exit(1)
  }

  // Lazy imports so dotenv loads first.
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { previewTenantBillingReset, executeTenantBillingReset } = await import(
    '@/lib/billing/reset-tenant'
  )

  // Resolve org slug → id, then delegate to the shared module.
  const admin = createAdminClient()
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('id, slug, name')
    .eq('slug', orgSlug)
    .maybeSingle()
  if (orgErr) throw orgErr
  if (!org) {
    console.error(`No organization with slug "${orgSlug}".`)
    process.exit(1)
  }

  console.log(`\n=== Reset tenant billing: ${org.name} (${org.slug}) ===`)
  console.log(
    `mode=${apply ? 'APPLY' : 'dry-run (re-run with --apply to execute)'}` +
      (apply && hard ? ' · HARD (will delete Stripe Customer)' : ''),
  )

  const preview = await previewTenantBillingReset(org.id)
  console.log(`\nStripe Customers: ${preview.customerIds.join(', ') || '(none)'}`)
  console.log(
    `\n  cancel  ${preview.subscriptionsToCancel.length} subscription(s)`,
  )
  for (const s of preview.subscriptionsToCancel) {
    console.log(
      `    - ${s.id}  status=${s.status}  qty=${s.quantity ?? '?'}  price=${s.priceId ?? '?'}`,
    )
  }
  console.log(`  void    ${preview.invoicesToVoid.length} invoice(s)`)
  for (const i of preview.invoicesToVoid) {
    console.log(
      `    - ${i.id}  status=${i.status}  ${i.amount_due_cents / 100} ${i.currency.toUpperCase()}`,
    )
  }
  console.log(`  delete  ${preview.dbRowsToDelete} billing_subscriptions row(s)`)

  if (!preview.hasWorkToDo) {
    console.log(`\nNothing to reset — this tenant is already clean.`)
    return
  }

  if (!apply) {
    console.log(`\nThis was a dry run. Re-run with --apply to execute.`)
    return
  }

  const summary = await executeTenantBillingReset(org.id, { hard })
  console.log(`\n=== Summary ===`)
  console.log(`  Subscriptions cancelled: ${summary.subscriptionsCancelled}`)
  console.log(`  Invoices voided/deleted: ${summary.invoicesVoided}`)
  console.log(`  DB rows cleared:         ${summary.dbRowsDeleted}`)
  if (summary.customersDeleted > 0) {
    console.log(`  Stripe Customers deleted: ${summary.customersDeleted}`)
  }
  console.log(
    `\nDone. The org can now visit /billing and start subscriptions ` +
      `per-property under the new model.${
        hard ? ' Saved cards have been wiped (--hard).' : ''
      }`,
  )
}

main().catch((err) => {
  console.error('\nFAILED:', err)
  process.exit(1)
})
