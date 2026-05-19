import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  Adapter,
  AdapterContext,
  AdapterResult,
  Observation,
} from './types'

export type RunOutcome = {
  source: string
  run_id: string
  status: 'ok' | 'partial' | 'error' | 'skipped'
  observations_written: number
  api_calls: number
  errors: number
  error_sample?: string
}

export type RunOptions = {
  trigger?: 'cron' | 'on_demand' | 'admin'
}

/**
 * Execute one adapter end-to-end:
 *   1. Read its registry row; bail if disabled
 *   2. Verify any required env var is set
 *   3. Open a data_source_runs row
 *   4. Invoke the adapter; persist observations in batches
 *   5. Finalize the run row + update registry health columns
 *
 * Idempotent on the adapter side — re-running produces no harm
 * beyond duplicate observation rows (L2 normalizers dedupe).
 */
export async function runAdapter(
  adapter: Adapter,
  context: AdapterContext,
  opts: RunOptions = {},
): Promise<RunOutcome> {
  const admin = createAdminClient()
  const trigger = opts.trigger ?? 'cron'

  const { data: registry } = await admin
    .from('data_source_registry')
    .select('source, enabled, api_key_env_var')
    .eq('source', adapter.source)
    .maybeSingle<{ source: string; enabled: boolean; api_key_env_var: string | null }>()

  if (!registry) {
    return {
      source: adapter.source,
      run_id: '',
      status: 'error',
      observations_written: 0,
      api_calls: 0,
      errors: 1,
      error_sample: `No registry row for source '${adapter.source}'`,
    }
  }

  if (!registry.enabled) {
    return openAndCloseSkipped(adapter.source, trigger, 'disabled in registry')
  }

  if (registry.api_key_env_var) {
    const keyVal = process.env[registry.api_key_env_var]
    if (!keyVal || keyVal.trim() === '') {
      return openAndCloseSkipped(
        adapter.source,
        trigger,
        `missing env var ${registry.api_key_env_var}`,
      )
    }
  }

  // Open the run row.
  const { data: runRow, error: runErr } = await admin
    .from('data_source_runs')
    .insert({
      source: adapter.source,
      trigger,
      status: 'running',
    })
    .select('id')
    .single<{ id: string }>()
  if (runErr || !runRow) {
    throw new Error(`Failed to open data_source_runs row: ${runErr?.message ?? '?'}`)
  }
  const run_id = runRow.id
  await admin
    .from('data_source_registry')
    .update({
      last_run_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('source', adapter.source)

  let result: AdapterResult
  try {
    result = await adapter.run(context)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin
      .from('data_source_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'error',
        error_count: 1,
        error_sample: message,
      })
      .eq('id', run_id)
    await admin
      .from('data_source_registry')
      .update({
        last_error_at: new Date().toISOString(),
        last_error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('source', adapter.source)
    return {
      source: adapter.source,
      run_id,
      status: 'error',
      observations_written: 0,
      api_calls: 0,
      errors: 1,
      error_sample: message,
    }
  }

  // Write observations in batches of 500 to keep the request under
  // the Supabase payload limit at high-volume sources.
  let written = 0
  if (result.observations.length > 0) {
    for (const batch of chunk(result.observations, 500)) {
      const rows = batch.map((o) => observationToRow(o, adapter.source, run_id))
      const { error: insErr } = await admin
        .from('external_observations')
        .insert(rows)
      if (insErr) {
        result.errors.push({
          message: `insert failed: ${insErr.message}`,
          context: { batch_size: batch.length },
        })
      } else {
        written += batch.length
      }
    }
  }

  const status: RunOutcome['status'] =
    result.errors.length === 0
      ? 'ok'
      : written > 0
        ? 'partial'
        : 'error'
  const errorSample = result.errors.slice(0, 3).map((e) => e.message).join('\n') || null

  await admin
    .from('data_source_runs')
    .update({
      finished_at: new Date().toISOString(),
      status,
      rows_ingested: written,
      api_calls: result.api_calls,
      error_count: result.errors.length,
      error_sample: errorSample,
    })
    .eq('id', run_id)

  const registryUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (status === 'ok' || status === 'partial') {
    registryUpdate.last_ok_at = new Date().toISOString()
    registryUpdate.observations_total =
      // observations_total is a bigint — bump via SQL would be cleaner
      // but a simple read-modify-write is fine at our run frequency.
      await readObservationsTotal(adapter.source) + written
  }
  if (errorSample) {
    registryUpdate.last_error_at = new Date().toISOString()
    registryUpdate.last_error_message = errorSample
  }
  await admin
    .from('data_source_registry')
    .update(registryUpdate)
    .eq('source', adapter.source)

  return {
    source: adapter.source,
    run_id,
    status,
    observations_written: written,
    api_calls: result.api_calls,
    errors: result.errors.length,
    error_sample: errorSample ?? undefined,
  }
}

async function openAndCloseSkipped(
  source: string,
  trigger: 'cron' | 'on_demand' | 'admin',
  reason: string,
): Promise<RunOutcome> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('data_source_runs')
    .insert({
      source,
      trigger,
      status: 'skipped',
      finished_at: new Date().toISOString(),
      error_sample: reason,
    })
    .select('id')
    .single<{ id: string }>()
  return {
    source,
    run_id: data?.id ?? '',
    status: 'skipped',
    observations_written: 0,
    api_calls: 0,
    errors: 0,
    error_sample: reason,
  }
}

async function readObservationsTotal(source: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('data_source_registry')
    .select('observations_total')
    .eq('source', source)
    .maybeSingle<{ observations_total: number }>()
  return Number(data?.observations_total ?? 0)
}

function observationToRow(
  o: Observation,
  source: string,
  run_id: string,
): Record<string, unknown> {
  return {
    source,
    source_run_id: run_id,
    observed_at: o.observed_at,
    target_kind: o.target_kind,
    target_key: o.target_key ?? null,
    geo_key: o.geo_key ?? null,
    property_id: o.property_id ?? null,
    org_id: o.org_id ?? null,
    payload: o.payload,
    payload_raw: o.payload_raw ?? null,
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}
