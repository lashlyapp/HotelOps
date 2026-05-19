import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export type DataSourceRegistryRow = {
  source: string
  category: string
  display_name: string
  description: string | null
  api_key_env_var: string | null
  cron_schedule: string | null
  cron_path: string | null
  required_for_signals: string[]
  enabled: boolean
  configured_at: string
  updated_at: string
  last_run_started_at: string | null
  last_ok_at: string | null
  last_error_at: string | null
  last_error_message: string | null
  observations_24h: number
  observations_total: number
}

export type DataSourceHealth = DataSourceRegistryRow & {
  // Health view augmentations:
  api_key_present: boolean
  status_indicator: 'ok' | 'warn' | 'error' | 'disabled' | 'unconfigured'
}

export async function listDataSourcesWithHealth(): Promise<DataSourceHealth[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('data_source_registry')
    .select('*')
    .order('category', { ascending: true })
    .order('display_name', { ascending: true })
  if (error) throw new Error(`listDataSources: ${error.message}`)
  return ((data as DataSourceRegistryRow[] | null) ?? []).map(annotate)
}

export async function getDataSource(source: string): Promise<DataSourceRegistryRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('data_source_registry')
    .select('*')
    .eq('source', source)
    .maybeSingle<DataSourceRegistryRow>()
  return data
}

export async function setDataSourceEnabled(source: string, enabled: boolean): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('data_source_registry')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('source', source)
  if (error) throw new Error(`setDataSourceEnabled: ${error.message}`)
}

function annotate(row: DataSourceRegistryRow): DataSourceHealth {
  const api_key_present = !row.api_key_env_var
    ? true
    : Boolean(process.env[row.api_key_env_var]?.trim())

  let status_indicator: DataSourceHealth['status_indicator']
  if (!row.enabled) {
    status_indicator = 'disabled'
  } else if (!api_key_present) {
    status_indicator = 'unconfigured'
  } else if (row.last_error_at && (!row.last_ok_at || row.last_error_at > row.last_ok_at)) {
    status_indicator = 'error'
  } else if (!row.last_ok_at) {
    status_indicator = 'warn'
  } else if (Date.now() - new Date(row.last_ok_at).getTime() > 36 * 60 * 60 * 1000) {
    status_indicator = 'warn'
  } else {
    status_indicator = 'ok'
  }

  return { ...row, api_key_present, status_indicator }
}

// Per-source recent runs for the drill-in view.
export type RunRow = {
  id: string
  source: string
  trigger: string
  started_at: string
  finished_at: string | null
  status: string
  rows_ingested: number
  api_calls: number
  error_count: number
  error_sample: string | null
}

export async function listRecentRuns(source: string, limit = 20): Promise<RunRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('data_source_runs')
    .select('*')
    .eq('source', source)
    .order('started_at', { ascending: false })
    .limit(limit)
  return (data as RunRow[] | null) ?? []
}
