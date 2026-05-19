import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Promote external_observations(target_kind='rate') into
// competitor_rate_snapshots. Idempotent on the per-(competitor,
// source, scrape_date, target_date) unique constraint.

export async function normalizeRates(options: { since?: string } = {}): Promise<number> {
  const admin = createAdminClient()
  const since = options.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('external_observations')
    .select('source, property_id, payload, observed_at')
    .eq('target_kind', 'rate')
    .gte('cleansed_at', since)
    .limit(20000)
  if (error) throw new Error(`normalizeRates read: ${error.message}`)

  type Row = {
    competitor_id: string
    property_id: string
    source: string
    scrape_date: string
    target_date: string
    currency: string
    rate_min: number | null
    rate_max: number | null
    availability: string | null
    rooms_left_hint: number | null
    expires_at: string
  }
  const rows: Row[] = []
  for (const row of (data as Array<{
    source: string
    property_id: string | null
    payload: Record<string, unknown>
    observed_at: string
  }> | null) ?? []) {
    if (!row.property_id) continue
    const p = row.payload
    const competitor_id = typeof p.competitor_id === 'string' ? p.competitor_id : null
    const target_date = typeof p.target_date === 'string' ? p.target_date : null
    const scrape_date = typeof p.scrape_date === 'string' ? p.scrape_date : null
    const currency = typeof p.currency === 'string' ? p.currency : null
    const expires_at = typeof p.expires_at === 'string' ? p.expires_at : null
    if (!competitor_id || !target_date || !scrape_date || !currency || !expires_at) continue
    rows.push({
      competitor_id,
      property_id: row.property_id,
      source: row.source,
      scrape_date,
      target_date,
      currency,
      rate_min: numOrNull(p.rate_min),
      rate_max: numOrNull(p.rate_max),
      availability: typeof p.availability === 'string' ? p.availability : null,
      rooms_left_hint: typeof p.rooms_left_hint === 'number' ? p.rooms_left_hint : null,
      expires_at,
    })
  }

  if (rows.length === 0) return 0
  const { error: insErr } = await admin
    .from('competitor_rate_snapshots')
    .upsert(rows, {
      onConflict: 'competitor_id,source,scrape_date,target_date',
      ignoreDuplicates: false,
    })
  if (insErr) throw new Error(`normalizeRates write: ${insErr.message}`)
  return rows.length
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return null
}
