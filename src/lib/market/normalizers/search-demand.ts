import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export async function normalizeSearchDemand(options: { since?: string } = {}): Promise<number> {
  const admin = createAdminClient()
  const since = options.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('external_observations')
    .select('source, geo_key, payload, observed_at')
    .eq('target_kind', 'pageview')
    .gte('cleansed_at', since)
    .limit(20000)
  if (error) throw new Error(`normalizeSearchDemand read: ${error.message}`)

  type Row = {
    geo_key: string
    query: string
    source: string
    observed_at: string
    measurement_date: string
    score: number
    source_market: string | null
  }
  const rows: Row[] = []
  for (const row of (data as Array<{
    source: string
    geo_key: string | null
    payload: Record<string, unknown>
    observed_at: string
  }> | null) ?? []) {
    if (!row.geo_key) continue
    const p = row.payload
    const measurement_date = typeof p.measurement_date === 'string' ? p.measurement_date : null
    const score = typeof p.score === 'number' ? p.score : null
    const query = typeof p.query === 'string' ? p.query : null
    if (!measurement_date || score == null || !query) continue
    rows.push({
      geo_key: row.geo_key,
      query,
      source: row.source,
      observed_at: row.observed_at,
      measurement_date,
      score,
      source_market: typeof p.source_market === 'string' ? p.source_market : null,
    })
  }

  if (rows.length === 0) return 0
  const { error: insErr } = await admin
    .from('search_demand_observations')
    .upsert(rows, {
      onConflict: 'geo_key,query,source,source_market,measurement_date',
      ignoreDuplicates: true,
    })
  if (insErr) {
    // null source_market may break the unique-on-NULL semantics; try
    // row-by-row insert ignoring duplicate-key errors.
    let written = 0
    for (const row of rows) {
      const { error: e } = await admin.from('search_demand_observations').insert(row)
      if (!e) written++
    }
    return written
  }
  return rows.length
}
