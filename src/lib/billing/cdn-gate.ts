import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  BillingSubscription,
  BillingSubscriptionStatus,
} from '@/lib/supabase/types'
import { computeOrgGate, type BillingGate } from './gate'

/**
 * Decide whether an org's media should be locked at the CDN edge.
 *
 * Pure function so it's testable. Delegates to computeOrgGate, which under
 * the per-property model only locks org-wide when the org has properties
 * but no subscriptions at all (onboarding state). Single-property issues
 * — canceled / paused / 15+ past-due on one property in a multi-property
 * org — do NOT lock at the edge; the in-app gate (computePropertyGate)
 * still blocks the property's pages and write actions.
 *
 * TODO: per-property CDN gating. The current KV namespace is keyed on
 * org_slug only; extending to `gate:{org_slug}:{property_slug}` plus a
 * worker update would close the under-lock gap for a single property in
 * a multi-property org. Not in scope here.
 */
export function shouldLockOrg(
  subscriptions: BillingSubscription[],
  hasProperties = true,
): boolean {
  // Brand-new org with no properties has no media to serve; CDN lock is a
  // no-op (and a false-positive lock would block logo uploads during
  // onboarding). The in-app gate still nudges them to /billing.
  if (subscriptions.length === 0 && !hasProperties) return false
  return computeOrgGate(subscriptions, hasProperties).restrictMedia
}

type CfConfig = {
  accountId: string
  apiToken: string
  namespaceId: string
  /** Optional — when set, we purge the zone's cache for the org's prefix
   *  after a state change so the new state takes effect in seconds, not in
   *  whatever the CDN cache TTL is. */
  zoneId: string | null
  /** Hostname on which media is served (e.g. cdn.myhotelops.com).
   *  Required for cache purge to know what URL to purge. */
  cdnHost: string | null
}

function readConfig(): CfConfig | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  const namespaceId = process.env.CLOUDFLARE_KV_GATE_NAMESPACE_ID
  if (!accountId || !apiToken || !namespaceId) return null

  let cdnHost: string | null = null
  try {
    const cdnUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
    if (cdnUrl) cdnHost = new URL(cdnUrl).hostname
  } catch {
    // ignore — cdnHost stays null and we skip cache purge
  }

  return {
    accountId,
    apiToken,
    namespaceId,
    zoneId: process.env.CLOUDFLARE_ZONE_ID ?? null,
    cdnHost,
  }
}

/**
 * Push the gate state for one org into Cloudflare KV (so the Worker can
 * 403 incoming media requests) and purge the zone's cache for the org's
 * prefix (so already-cached responses don't keep serving for the
 * remainder of their TTL).
 *
 * Best-effort: when CF env isn't configured, no-op. When the API call
 * fails, log and continue — the DB state is still correct, and the
 * backfill script can repair KV later.
 */
export async function syncGateToCdn(orgId: string): Promise<void> {
  const cfg = readConfig()
  if (!cfg) return // not configured, e.g. local dev or pre-deploy

  const admin = createAdminClient()
  const [orgRes, subRes, propRes] = await Promise.all([
    admin.from('organizations').select('slug').eq('id', orgId).maybeSingle(),
    admin.from('billing_subscriptions').select('*').eq('org_id', orgId),
    admin
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
  ])
  const orgSlug = orgRes.data?.slug
  if (!orgSlug) return // org deleted or not found

  const subs = (subRes.data as BillingSubscription[] | null) ?? []
  const hasProperties = (propRes.count ?? 0) > 0
  const lock = shouldLockOrg(subs, hasProperties)
  await writeKv(cfg, orgSlug, lock)
  if (lock && cfg.zoneId && cfg.cdnHost) {
    // Only purge on lock — on unlock, stale 403s in cache are short
    // (Cache-Control: no-store) so they don't stick.
    await purgeOrgPrefix(cfg, orgSlug)
  }
}

async function writeKv(
  cfg: CfConfig,
  orgSlug: string,
  lock: boolean,
): Promise<void> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/storage/kv/namespaces/${cfg.namespaceId}/values/gate:${encodeURIComponent(orgSlug)}`
  if (lock) {
    const r = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${cfg.apiToken}`,
        'Content-Type': 'text/plain',
      },
      body: '1',
    })
    if (!r.ok) {
      console.warn(
        `[cdn-gate] KV PUT failed for ${orgSlug}: ${r.status} ${await r.text()}`,
      )
    }
    return
  }
  const r = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${cfg.apiToken}` },
  })
  if (!r.ok && r.status !== 404) {
    console.warn(
      `[cdn-gate] KV DELETE failed for ${orgSlug}: ${r.status} ${await r.text()}`,
    )
  }
}

async function purgeOrgPrefix(cfg: CfConfig, orgSlug: string): Promise<void> {
  // CF Free/Pro: per-URL purge only. We don't have an exhaustive media list
  // here without an extra DB query, so for v1 fall back to purging the
  // hostname-scoped tag (Enterprise) and a representative URL. If the
  // account is non-Enterprise the tag purge is a 4xx; we ignore it.
  const url = `https://api.cloudflare.com/client/v4/zones/${cfg.zoneId}/purge_cache`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tags: [`org:${orgSlug}`],
      // Hostname purge would nuke ALL tenants' cache; deliberately not used.
    }),
  })
  if (!r.ok) {
    // Expected on non-Enterprise plans (tag purge unsupported). The
    // worker's max-age=3600 caps stale-serve to 1hr regardless.
    console.info(
      `[cdn-gate] cache purge skipped for ${orgSlug}: ${r.status} (likely non-Enterprise plan)`,
    )
  }
}

/**
 * Used by scripts/sync-cdn-gate.ts to bulk-populate KV from current state.
 * Returns one entry per org with the action that was taken so the script
 * can print a sane summary.
 */
export async function listGateDecisions(): Promise<
  Array<{
    org_id: string
    org_slug: string
    status: BillingSubscriptionStatus | null
    lock: boolean
  }>
> {
  const admin = createAdminClient()
  const { data: orgs } = await admin
    .from('organizations')
    .select('id, slug')
    .order('slug')
  const { data: subs } = await admin.from('billing_subscriptions').select('*')
  const { data: properties } = await admin
    .from('properties')
    .select('id, org_id')

  const subsByOrg = new Map<string, BillingSubscription[]>()
  for (const s of (subs ?? []) as BillingSubscription[]) {
    const list = subsByOrg.get(s.org_id) ?? []
    list.push(s)
    subsByOrg.set(s.org_id, list)
  }
  const orgsWithProperties = new Set<string>()
  for (const p of properties ?? []) {
    orgsWithProperties.add(p.org_id as string)
  }

  // Pick the most representative status to surface for ops dashboards. Order:
  // worst-active issue (past_due/unpaid/paused/canceled) → first active → null.
  const STATUS_RANK: Record<BillingSubscriptionStatus, number> = {
    incomplete_expired: 6,
    canceled: 5,
    paused: 4,
    unpaid: 3,
    past_due: 2,
    incomplete: 1,
    trialing: 0,
    active: 0,
  }

  return (orgs ?? []).map((o) => {
    const orgSubs = subsByOrg.get(o.id) ?? []
    const hasProperties = orgsWithProperties.has(o.id)
    const worst =
      orgSubs.length === 0
        ? null
        : orgSubs.reduce((acc, s) =>
            STATUS_RANK[s.status] > STATUS_RANK[acc.status] ? s : acc,
          )
    return {
      org_id: o.id,
      org_slug: o.slug,
      status: worst?.status ?? null,
      lock: shouldLockOrg(orgSubs, hasProperties),
    }
  })
}

// Re-export the BillingGate type for convenience in scripts.
export type { BillingGate }
