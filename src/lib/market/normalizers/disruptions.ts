import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export async function normalizeDisruptions(options: { since?: string } = {}): Promise<number> {
  const admin = createAdminClient()
  const since = options.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('external_observations')
    .select('source, target_key, geo_key, payload, observed_at')
    .eq('target_kind', 'disruption')
    .gte('cleansed_at', since)
    .limit(5000)
  if (error) throw new Error(`normalizeDisruptions read: ${error.message}`)

  type Row = {
    source: string
    external_id: string | null
    geo_key: string
    kind: string
    severity: string
    observed_at: string
    effective_at: string | null
    ends_at: string | null
    headline: string
    description: string | null
  }
  const rows: Row[] = []
  for (const row of (data as Array<{
    source: string
    target_key: string | null
    geo_key: string | null
    payload: Record<string, unknown>
    observed_at: string
  }> | null) ?? []) {
    if (!row.geo_key) continue
    const p = row.payload
    const headline = typeof p.headline === 'string' ? p.headline : null
    if (!headline) continue
    rows.push({
      source: row.source,
      external_id: typeof p.external_id === 'string' ? p.external_id : null,
      geo_key: row.geo_key,
      kind: typeof p.kind === 'string' ? p.kind : 'closure',
      severity: typeof p.severity === 'string' ? p.severity : 'medium',
      observed_at: row.observed_at,
      effective_at: typeof p.effective_at === 'string' ? p.effective_at : null,
      ends_at: typeof p.ends_at === 'string' ? p.ends_at : null,
      headline,
      description: typeof p.description === 'string' ? p.description : null,
    })
  }

  if (rows.length === 0) return 0
  const { error: insErr } = await admin
    .from('disruption_observations')
    .upsert(rows, { onConflict: 'source,external_id', ignoreDuplicates: false })
  if (insErr) throw new Error(`normalizeDisruptions write: ${insErr.message}`)
  return rows.length
}
