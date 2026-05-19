import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export async function normalizeWeather(options: { since?: string } = {}): Promise<number> {
  const admin = createAdminClient()
  const since = options.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('external_observations')
    .select('payload, observed_at, geo_key, source')
    .eq('target_kind', 'weather')
    .gte('cleansed_at', since)
    .limit(10000)
  if (error) throw new Error(`normalizeWeather read: ${error.message}`)

  type Row = {
    geo_key: string
    source: string
    observed_at: string
    forecast_date: string
    temp_high_c: number | null
    temp_low_c: number | null
    precip_mm: number | null
    wind_kph_max: number | null
    conditions: string | null
    severe_alert: string | null
  }
  const rows: Row[] = []
  for (const row of (data as Array<{
    payload: Record<string, unknown>
    observed_at: string
    geo_key: string | null
    source: string
  }> | null) ?? []) {
    if (!row.geo_key) continue
    const p = row.payload
    const forecast_date = typeof p.forecast_date === 'string' ? p.forecast_date : null
    if (!forecast_date) continue
    rows.push({
      geo_key: row.geo_key,
      source: row.source,
      observed_at: row.observed_at,
      forecast_date,
      temp_high_c: numOrNull(p.temp_high_c),
      temp_low_c: numOrNull(p.temp_low_c),
      precip_mm: numOrNull(p.precip_mm),
      wind_kph_max: numOrNull(p.wind_kph_max),
      conditions: typeof p.conditions === 'string' ? p.conditions : null,
      severe_alert: typeof p.severe_alert === 'string' ? p.severe_alert : null,
    })
  }

  if (rows.length === 0) return 0
  const { error: insErr } = await admin
    .from('weather_observations')
    .upsert(rows, {
      onConflict: 'geo_key,source,forecast_date,observed_at',
      ignoreDuplicates: true,
    })
  if (insErr) throw new Error(`normalizeWeather write: ${insErr.message}`)
  return rows.length
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return null
}
