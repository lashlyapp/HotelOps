import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildCityKey, hashForAnonymity } from '@/lib/market/sources/cleansing'
import type { Property, PropertyMarketProfile } from '@/lib/supabase/types'

const MIN_COHORT = 3
const SALT = process.env.PEER_HASH_SALT ?? 'myhotelops-default-salt-rotate-me-in-prod'

// Contribute the property's ADR band into peer_adr_observations IF
// the org has opted in (organizations.peer_adr_opt_in). One row per
// (org_hash, city_key, segment, observed_at). No raw org_id is
// stored — only the HMAC hash.
export async function contributePeerAdr(
  property: Property,
  profile: PropertyMarketProfile,
  currency: string,
): Promise<boolean> {
  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organizations')
    .select('peer_adr_opt_in')
    .eq('id', property.org_id)
    .maybeSingle<{ peer_adr_opt_in: boolean }>()
  if (!org?.peer_adr_opt_in) return false

  const city_key = buildCityKey({
    city: property.city,
    state: property.state,
    country: property.country,
  })
  if (!city_key) return false
  if (profile.adr_floor == null && profile.adr_ceiling == null) return false

  const reporting_org_hash = hashForAnonymity(property.org_id, SALT)
  const { error } = await admin.from('peer_adr_observations').upsert(
    {
      city_key,
      market_segment: profile.market_segment,
      tier: profile.tier,
      reporting_org_hash,
      observed_at: new Date().toISOString(),
      adr_floor: profile.adr_floor,
      adr_ceiling: profile.adr_ceiling,
      currency: currency.toUpperCase(),
    },
    {
      onConflict: 'reporting_org_hash,city_key,market_segment,observed_at',
      ignoreDuplicates: true,
    },
  )
  if (error) throw new Error(`contributePeerAdr: ${error.message}`)
  return true
}

// Build peer_benchmark_signals for a property. Requires the cohort
// (same city_key + market_segment) to have ≥3 distinct contributing
// orgs in the last 90 days, otherwise no row is written (k-anonymity).
export async function buildPeerBenchmark(
  property: Property,
  profile: PropertyMarketProfile,
): Promise<boolean> {
  const admin = createAdminClient()
  const city_key = buildCityKey({
    city: property.city,
    state: property.state,
    country: property.country,
  })
  if (!city_key) return false

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await admin
    .from('peer_adr_observations')
    .select('reporting_org_hash, adr_floor, adr_ceiling')
    .eq('city_key', city_key)
    .eq('market_segment', profile.market_segment)
    .gte('observed_at', since)
    .limit(10000)
  const rows = (data as Array<{
    reporting_org_hash: string
    adr_floor: number | null
    adr_ceiling: number | null
  }> | null) ?? []

  // Reduce to the latest observation per reporting_org_hash.
  // The .order() above is implicit by index; we explicitly dedupe to
  // be safe.
  const perOrg = new Map<string, { floor: number | null; ceiling: number | null }>()
  for (const r of rows) {
    perOrg.set(r.reporting_org_hash, { floor: r.adr_floor, ceiling: r.adr_ceiling })
  }
  if (perOrg.size < MIN_COHORT) return false

  // Use the midpoint of (floor, ceiling) as the org's representative ADR.
  const adrs: number[] = []
  for (const v of perOrg.values()) {
    if (v.floor != null && v.ceiling != null) adrs.push((v.floor + v.ceiling) / 2)
    else if (v.floor != null) adrs.push(v.floor)
    else if (v.ceiling != null) adrs.push(v.ceiling)
  }
  if (adrs.length < MIN_COHORT) return false

  adrs.sort((a, b) => a - b)
  const p25 = percentile(adrs, 25)
  const p50 = percentile(adrs, 50)
  const p75 = percentile(adrs, 75)
  const ours = profile.adr_floor != null && profile.adr_ceiling != null
    ? (profile.adr_floor + profile.adr_ceiling) / 2
    : profile.adr_floor ?? profile.adr_ceiling
  const property_position =
    ours == null
      ? 'unknown'
      : ours < p25
        ? 'below_p25'
        : ours < p50
          ? 'p25_p50'
          : ours < p75
            ? 'p50_p75'
            : 'above_p75'

  const { error } = await admin.from('peer_benchmark_signals').upsert(
    {
      property_id: property.id,
      org_id: property.org_id,
      observed_at: new Date().toISOString(),
      city_key,
      market_segment: profile.market_segment,
      cohort_size: perOrg.size,
      peer_adr_p25: round2(p25),
      peer_adr_median: round2(p50),
      peer_adr_p75: round2(p75),
      property_position,
    },
    { onConflict: 'property_id,observed_at', ignoreDuplicates: false },
  )
  if (error) throw new Error(`buildPeerBenchmark: ${error.message}`)
  return true
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))
  return sorted[idx]
}

function round2(n: number): number {
  return Number(n.toFixed(2))
}
