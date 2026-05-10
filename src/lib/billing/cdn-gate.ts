import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  BillingSubscription,
  BillingSubscriptionStatus,
} from '@/lib/supabase/types'
import { computeGate, type BillingGate } from './gate'

/**
 * Decide whether an org's media should be locked at the CDN edge.
 *
 * Pure function so it's testable. Currently delegates to computeGate so the
 * 15-day threshold (and "canceled" / "paused" terminal states) stay in one
 * place — if you change the in-app gate threshold, the CDN follows.
 */
export function shouldLockOrg(
  subscription: BillingSubscription | null,
): boolean {
  return computeGate(subscription).restrictMedia
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
  const [orgRes, subRes] = await Promise.all([
    admin.from('organizations').select('slug').eq('id', orgId).maybeSingle(),
    admin
      .from('billing_subscriptions')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle(),
  ])
  const orgSlug = orgRes.data?.slug
  if (!orgSlug) return // org deleted or not found

  const lock = shouldLockOrg(
    (subRes.data as BillingSubscription | null) ?? null,
  )
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

  const subByOrg = new Map<string, BillingSubscription>()
  for (const s of (subs ?? []) as BillingSubscription[]) {
    subByOrg.set(s.org_id, s)
  }

  return (orgs ?? []).map((o) => {
    const sub = subByOrg.get(o.id) ?? null
    return {
      org_id: o.id,
      org_slug: o.slug,
      status: sub?.status ?? null,
      lock: shouldLockOrg(sub),
    }
  })
}

// Re-export the BillingGate type for convenience in scripts.
export type { BillingGate }
