/**
 * Sanity-check an org before kicking off Stripe billing for it. Prints:
 *   - org row (id, name, slug, created_at)
 *   - org_owner profile + email (or warns if missing — Stripe Customer
 *     gets that email and it's where invoice notifications land)
 *   - property count (the subscription quantity)
 *   - existing billing_subscriptions row, if any
 *
 * Catches the "wrong slug" / "owner has no email" / "already started"
 * failure modes that would otherwise surface from `start-subscription` as
 * Stripe API errors.
 *
 * Usage:
 *   npx tsx scripts/verify-billing-readiness.ts --org-slug=cg-hotel-group
 *
 * Required env (read from .env.local locally; from secrets in CI):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadEnv({ path: resolve(process.cwd(), '.env.local') })

const args = parseArgs(process.argv.slice(2))
const SUPABASE_URL = required('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE = required('SUPABASE_SERVICE_ROLE_KEY')

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  let issues = 0

  console.log(`Looking up org with slug "${args.orgSlug}"…\n`)
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('*')
    .eq('slug', args.orgSlug)
    .maybeSingle()
  if (orgErr) throw orgErr
  if (!org) {
    fail(`No organization with slug "${args.orgSlug}".`)
    await suggestNeighbors(args.orgSlug)
    process.exit(1)
  }
  ok(`Org: ${org.name} (${org.id}) — created ${org.created_at}`)

  // Owner profile + email
  const { data: owners, error: ownerErr } = await admin
    .from('profiles')
    .select('id, full_name, role')
    .eq('org_id', org.id)
    .eq('role', 'org_owner')
  if (ownerErr) throw ownerErr
  if (!owners || owners.length === 0) {
    issues += 1
    warn('No org_owner profile linked. Stripe Customer will be created with no email.')
  } else {
    for (const owner of owners) {
      const { data: user } = await admin.auth.admin.getUserById(owner.id)
      const email = user.user?.email ?? null
      if (!email) {
        issues += 1
        warn(`Owner ${owner.full_name ?? owner.id} has no email — invoice emails won't reach them.`)
      } else {
        ok(`Owner: ${owner.full_name ?? '(no name)'} <${email}>`)
      }
    }
  }

  // Properties → subscription quantity
  const { count: propertyCount, error: propErr } = await admin
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', org.id)
  if (propErr) throw propErr
  const quantity = Math.max(1, propertyCount ?? 0)
  if ((propertyCount ?? 0) === 0) {
    issues += 1
    warn('Org has 0 properties. Subscription quantity will default to 1; double-check that\'s intended.')
  } else {
    ok(`Properties: ${propertyCount} → subscription quantity = ${quantity}`)
  }

  // Existing billing_subscriptions row
  const { data: existing } = await admin
    .from('billing_subscriptions')
    .select('*')
    .eq('org_id', org.id)
    .maybeSingle()
  if (!existing) {
    ok('No prior billing_subscriptions row — start-subscription will create one fresh.')
  } else {
    if (existing.stripe_subscription_id) {
      const terminal =
        existing.status === 'canceled' || existing.status === 'incomplete_expired'
      if (terminal) {
        warn(
          `Prior subscription ${existing.stripe_subscription_id} is ${existing.status}; start-subscription will create a new one.`,
        )
      } else {
        warn(
          `Subscription already exists: ${existing.stripe_subscription_id} (status=${existing.status}). start-subscription will skip.`,
        )
      }
    } else {
      ok(
        `Customer record only (id=${existing.stripe_customer_id ?? '?'}); subscription will be created on next run.`,
      )
    }
  }

  console.log('')
  if (issues === 0) {
    console.log('Ready. Run `npm run start:subscription -- --org-slug=' + args.orgSlug + '`.')
  } else {
    console.log(`${issues} issue${issues === 1 ? '' : 's'} found above. Fix before running start-subscription.`)
    process.exit(2)
  }
}

async function suggestNeighbors(slug: string) {
  const { data } = await admin
    .from('organizations')
    .select('slug')
    .ilike('slug', `%${slug.replace(/-/g, '%')}%`)
    .limit(10)
  if (data && data.length > 0) {
    console.log('\nSimilar slugs in DB:')
    for (const row of data) console.log(`  - ${row.slug}`)
  }
}

function ok(msg: string) {
  console.log(`  ok  ${msg}`)
}

function warn(msg: string) {
  console.log(`  !!  ${msg}`)
}

function fail(msg: string) {
  console.error(`  XX  ${msg}`)
}

type Args = { orgSlug: string }

function parseArgs(raw: string[]): Args {
  const out: { orgSlug?: string } = {}
  for (const arg of raw) {
    const eq = arg.indexOf('=')
    if (eq === -1) usage(`Unrecognized argument: ${arg}`)
    const key = arg.slice(0, eq).replace(/^--/, '')
    const value = arg.slice(eq + 1)
    if (key === 'org-slug') out.orgSlug = value
    else usage(`Unrecognized argument: --${key}`)
  }
  if (!out.orgSlug) usage('Missing --org-slug')
  return { orgSlug: out.orgSlug! }
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
    'Usage:\n  npx tsx scripts/verify-billing-readiness.ts --org-slug=<slug>\n',
  )
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
