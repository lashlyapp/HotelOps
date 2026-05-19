import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Property, PropertyMarketProfile } from '@/lib/supabase/types'

// Compute property_rate_parity_snapshots from competitor_rate_snapshots.
// v1 channel: 'comp_set_median' — the gap between the property's own
// ADR floor (from property_market_profile) and the median of fresh,
// un-expired competitor rate_min values for each target_date.

export async function buildParitySnapshots(
  property: Property,
  profile: PropertyMarketProfile,
): Promise<number> {
  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const nowIso = new Date().toISOString()

  const { data: rates } = await admin
    .from('competitor_rate_snapshots')
    .select('target_date, rate_min, currency, availability')
    .eq('property_id', property.id)
    .gte('target_date', today)
    .gt('expires_at', nowIso)
  const rateRows = (rates as Array<{
    target_date: string
    rate_min: number | null
    currency: string
    availability: string | null
  }> | null) ?? []
  if (rateRows.length === 0) return 0

  // Bucket by target_date, take the median of rate_min.
  const byDate = new Map<string, number[]>()
  for (const r of rateRows) {
    if (r.rate_min == null) continue
    const list = byDate.get(r.target_date) ?? []
    list.push(r.rate_min)
    byDate.set(r.target_date, list)
  }

  type Row = {
    property_id: string
    org_id: string
    channel: string
    scrape_date: string
    target_date: string
    our_rate: number | null
    channel_rate: number | null
    gap_pct: number | null
    source_count: number
  }
  const rows: Row[] = []
  const our = profile.adr_floor
  for (const [target_date, list] of byDate) {
    if (list.length === 0) continue
    const median = median1(list)
    const gap = our != null && median > 0 ? ((our - median) / median) * 100 : null
    rows.push({
      property_id: property.id,
      org_id: property.org_id,
      channel: 'comp_set_median',
      scrape_date: today,
      target_date,
      our_rate: our,
      channel_rate: Number(median.toFixed(2)),
      gap_pct: gap == null ? null : Number(gap.toFixed(2)),
      source_count: list.length,
    })
  }

  if (rows.length === 0) return 0
  const { error } = await admin
    .from('property_rate_parity_snapshots')
    .upsert(rows, {
      onConflict: 'property_id,channel,scrape_date,target_date',
      ignoreDuplicates: false,
    })
  if (error) throw new Error(`buildParitySnapshots: ${error.message}`)
  return rows.length
}

function median1(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}
