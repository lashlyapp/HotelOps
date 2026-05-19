import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export async function normalizeFx(options: { since?: string } = {}): Promise<number> {
  const admin = createAdminClient()
  const since = options.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('external_observations')
    .select('source, payload, observed_at')
    .eq('target_kind', 'fx')
    .gte('cleansed_at', since)
    .limit(100)
  if (error) throw new Error(`normalizeFx read: ${error.message}`)

  type Row = {
    base_currency: string
    observed_at: string
    rates: Record<string, number>
    source: string
  }
  const rows: Row[] = []
  for (const row of (data as Array<{
    source: string
    payload: Record<string, unknown>
    observed_at: string
  }> | null) ?? []) {
    const p = row.payload
    const base = typeof p.base_currency === 'string' ? p.base_currency : null
    const rates = p.rates as Record<string, number> | undefined
    if (!base || !rates || typeof rates !== 'object') continue
    rows.push({
      base_currency: base,
      observed_at: row.observed_at,
      rates,
      source: row.source,
    })
  }

  if (rows.length === 0) return 0
  const { error: insErr } = await admin
    .from('fx_observations')
    .upsert(rows, { onConflict: 'base_currency,observed_at', ignoreDuplicates: true })
  if (insErr) throw new Error(`normalizeFx write: ${insErr.message}`)
  return rows.length
}
