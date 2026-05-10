/**
 * Bulk-populate Cloudflare KV from current billing_subscriptions state so
 * the cdn-gate Worker enforces the right thing for every org. Run after:
 *   - first-time worker deploy (KV is empty)
 *   - rotating the KV namespace
 *   - any manual DB edits to billing_subscriptions / organizations.slug
 *
 * Idempotent. Safe to run any time.
 *
 * Usage:
 *   npm run sync:cdn-gate              # dry-run, prints intended changes
 *   npm run sync:cdn-gate -- --apply   # actually writes to CF KV
 *
 * Required env (read from .env.local locally, secrets in CI):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN              (with Workers KV:Edit on the namespace)
 *   CLOUDFLARE_KV_GATE_NAMESPACE_ID
 */

import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: resolve(process.cwd(), '.env.local') })

const apply = process.argv.includes('--apply')

async function main() {
  // Lazy-imported so dotenv loads first.
  const { listGateDecisions } = await import('@/lib/billing/cdn-gate')
  const decisions = await listGateDecisions()

  const cfg = {
    accountId: required('CLOUDFLARE_ACCOUNT_ID'),
    apiToken: required('CLOUDFLARE_API_TOKEN'),
    namespaceId: required('CLOUDFLARE_KV_GATE_NAMESPACE_ID'),
  }

  console.log(
    `${decisions.length} orgs · mode=${apply ? 'APPLY' : 'dry-run (re-run with --apply to commit)'}\n`,
  )

  let lockCount = 0
  let unlockCount = 0
  for (const d of decisions) {
    const verb = d.lock ? 'LOCK  ' : 'unlock'
    console.log(
      `  ${verb}  ${d.org_slug.padEnd(30)} status=${d.status ?? 'no_subscription'}`,
    )
    if (d.lock) lockCount += 1
    else unlockCount += 1
    if (!apply) continue

    const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/storage/kv/namespaces/${cfg.namespaceId}/values/gate:${encodeURIComponent(d.org_slug)}`
    const init: RequestInit = d.lock
      ? {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${cfg.apiToken}`,
            'Content-Type': 'text/plain',
          },
          body: '1',
        }
      : {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${cfg.apiToken}` },
        }
    const r = await fetch(url, init)
    if (!r.ok && !(r.status === 404 && !d.lock)) {
      console.error(`    !! failed: ${r.status} ${await r.text()}`)
    }
  }

  console.log(
    `\nSummary: ${lockCount} locked · ${unlockCount} unlocked${apply ? '' : ' (not committed)'}`,
  )
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return v
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
