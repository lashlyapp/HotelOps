import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Promote rows in external_observations(target_kind='holiday') into
// holidays_catalog. Idempotent — UPSERT on the unique key.

export async function normalizeHolidays(options: { since?: string } = {}): Promise<number> {
  const admin = createAdminClient()
  const since = options.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('external_observations')
    .select('payload, observed_at')
    .eq('target_kind', 'holiday')
    .gte('cleansed_at', since)
    .limit(5000)
  if (error) throw new Error(`normalizeHolidays read: ${error.message}`)

  type Row = {
    country_code: string
    region_code: string | null
    holiday_date: string
    name: string
    kind: string
    source: string
  }
  const rows: Row[] = []
  for (const row of (data as Array<{ payload: Record<string, unknown>; observed_at: string }> | null) ?? []) {
    const p = row.payload
    const country_code = typeof p.country_code === 'string' ? p.country_code : null
    const holiday_date = typeof p.holiday_date === 'string' ? p.holiday_date : null
    const name = typeof p.name === 'string' ? p.name : null
    if (!country_code || !holiday_date || !name) continue
    const region_codes = Array.isArray(p.region_codes) && p.region_codes.length > 0
      ? (p.region_codes as string[])
      : [null]
    for (const region of region_codes) {
      rows.push({
        country_code,
        region_code: region ?? null,
        holiday_date,
        name,
        kind: typeof p.kind === 'string' ? p.kind : 'public',
        source: 'nager_holidays',
      })
    }
  }

  if (rows.length === 0) return 0

  // upsert by the composite unique constraint; supabase-js doesn't
  // accept multi-column unique with coalesce, so we use ignoreDuplicates.
  const { error: insErr } = await admin
    .from('holidays_catalog')
    .upsert(rows, {
      onConflict: 'country_code,region_code,holiday_date,name',
      ignoreDuplicates: true,
    })
  if (insErr) {
    // ON CONFLICT with NULL region_code is tricky in supabase-js; fall
    // back to row-by-row insert ignoring duplicates.
    let written = 0
    for (const row of rows) {
      const { error: oneErr } = await admin
        .from('holidays_catalog')
        .insert(row)
      if (!oneErr) written++
    }
    return written
  }
  return rows.length
}
