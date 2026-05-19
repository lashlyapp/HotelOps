import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Promote rows in external_observations(target_kind='event') into
// events_catalog. Idempotent — UPSERT on (external_source, external_id).

export async function normalizeEvents(options: { since?: string } = {}): Promise<number> {
  const admin = createAdminClient()
  const since = options.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('external_observations')
    .select('id, source, target_key, geo_key, payload, observed_at')
    .eq('target_kind', 'event')
    .gte('cleansed_at', since)
    .limit(10000)
  if (error) throw new Error(`normalizeEvents read: ${error.message}`)

  type Row = {
    external_source: string
    external_id: string
    name: string
    category: string
    geo_key: string
    starts_at: string
    ends_at: string
    expected_attendance: number | null
    attendance_band: string | null
    source_url: string | null
    confidence: string
    updated_at: string
  }
  const rows: Row[] = []
  for (const row of (data as Array<{
    id: string
    source: string
    target_key: string | null
    geo_key: string | null
    payload: Record<string, unknown>
    observed_at: string
  }> | null) ?? []) {
    if (!row.target_key || !row.geo_key) continue
    const p = row.payload
    const name = typeof p.name === 'string' ? p.name : null
    const starts_at = typeof p.starts_at === 'string' ? p.starts_at : null
    const ends_at = typeof p.ends_at === 'string' ? p.ends_at : starts_at
    if (!name || !starts_at || !ends_at) continue
    rows.push({
      external_source: row.source,
      external_id: row.target_key,
      name,
      category: typeof p.category === 'string' ? p.category : 'other',
      geo_key: row.geo_key,
      starts_at,
      ends_at,
      expected_attendance: typeof p.expected_attendance === 'number' ? p.expected_attendance : null,
      attendance_band: typeof p.attendance_band === 'string' ? p.attendance_band : null,
      source_url: typeof p.source_url === 'string' ? p.source_url : null,
      confidence: typeof p.confidence === 'string' ? p.confidence : 'medium',
      updated_at: new Date().toISOString(),
    })
  }

  if (rows.length === 0) return 0
  const { error: insErr } = await admin
    .from('events_catalog')
    .upsert(rows, {
      onConflict: 'external_source,external_id',
      ignoreDuplicates: false,
    })
  if (insErr) throw new Error(`normalizeEvents write: ${insErr.message}`)
  return rows.length
}
