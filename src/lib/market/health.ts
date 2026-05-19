import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Source-health classifier. The hourly cron iterates registry rows
// and flips anything that has been silent or erroring past its
// expected freshness window into a single "unhealthy" report.
//
// Freshness expectation: roughly 2× the typical interval between
// runs for the source's cron schedule. We don't parse the actual
// cron spec; we lean on `cron_schedule` substrings as a heuristic.

const STALE_HOURS_DEFAULT = 36
const ALERT_DEDUPE_HOURS = 24

export type SourceHealthState = {
  source: string
  display_name: string
  enabled: boolean
  api_key_present: boolean
  last_ok_at: string | null
  last_error_at: string | null
  last_error_message: string | null
  last_health_alert_at: string | null
  cron_schedule: string | null
  reason: 'no_runs' | 'stale' | 'erroring' | 'healthy' | 'awaiting_key' | 'disabled'
}

export async function classifySourceHealth(): Promise<SourceHealthState[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('data_source_registry')
    .select(
      'source, display_name, enabled, api_key_env_var, cron_schedule, last_ok_at, last_error_at, last_error_message, last_health_alert_at',
    )
  if (error) throw new Error(`classifySourceHealth: ${error.message}`)
  const now = Date.now()
  return ((data as Array<{
    source: string
    display_name: string
    enabled: boolean
    api_key_env_var: string | null
    cron_schedule: string | null
    last_ok_at: string | null
    last_error_at: string | null
    last_error_message: string | null
    last_health_alert_at: string | null
  }> | null) ?? []).map((r) => {
    const api_key_present = !r.api_key_env_var
      ? true
      : Boolean(process.env[r.api_key_env_var]?.trim())
    let reason: SourceHealthState['reason']
    if (!r.enabled) reason = 'disabled'
    else if (!api_key_present) reason = 'awaiting_key'
    else if (!r.last_ok_at && !r.last_error_at) reason = 'no_runs'
    else if (
      r.last_error_at &&
      (!r.last_ok_at || new Date(r.last_error_at).getTime() > new Date(r.last_ok_at).getTime())
    )
      reason = 'erroring'
    else if (
      r.last_ok_at &&
      now - new Date(r.last_ok_at).getTime() > staleWindowHoursFor(r.cron_schedule) * 60 * 60 * 1000
    )
      reason = 'stale'
    else reason = 'healthy'

    return {
      source: r.source,
      display_name: r.display_name,
      enabled: r.enabled,
      api_key_present,
      last_ok_at: r.last_ok_at,
      last_error_at: r.last_error_at,
      last_error_message: r.last_error_message,
      last_health_alert_at: r.last_health_alert_at,
      cron_schedule: r.cron_schedule,
      reason,
    }
  })
}

// Sources requiring an alert: erroring or stale, and we haven't
// alerted on them in the last ALERT_DEDUPE_HOURS hours.
export function pickAlertableSources(
  states: SourceHealthState[],
  now: Date = new Date(),
): SourceHealthState[] {
  return states.filter((s) => {
    if (s.reason !== 'erroring' && s.reason !== 'stale') return false
    if (!s.last_health_alert_at) return true
    return (
      now.getTime() - new Date(s.last_health_alert_at).getTime() >
      ALERT_DEDUPE_HOURS * 60 * 60 * 1000
    )
  })
}

export async function markAlerted(sources: string[]): Promise<void> {
  if (sources.length === 0) return
  const admin = createAdminClient()
  const { error } = await admin
    .from('data_source_registry')
    .update({ last_health_alert_at: new Date().toISOString() })
    .in('source', sources)
  if (error) throw new Error(`markAlerted: ${error.message}`)
}

function staleWindowHoursFor(cron: string | null): number {
  if (!cron) return STALE_HOURS_DEFAULT
  // Crude heuristic: shorter expected gap → tighter stale window.
  // "*/2 * * * *" (every 2h) → 6h stale; "0 */6 * * *" (every 6h) → 18h;
  // daily → 36h; weekly → 8 days.
  if (cron.includes('* * * *') && /\*\/(\d+)/.test(cron)) {
    const m = cron.match(/\*\/(\d+)/)
    const everyN = m ? Number(m[1]) : 6
    return everyN * 3
  }
  if (cron.match(/^0 \* \* \* \*/)) return 3 // hourly
  if (cron.match(/^0 \*\/\d+/)) {
    const m = cron.match(/\*\/(\d+)/)
    return m ? Number(m[1]) * 3 : 18
  }
  if (cron.match(/^0 \d+ \* \* \d$/)) return 24 * 8 // weekly
  return STALE_HOURS_DEFAULT
}
