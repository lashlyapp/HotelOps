'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '@/lib/auth/session'
import { getDataSource, setDataSourceEnabled } from '@/lib/market/registry'
import { buildAdapterContext } from '@/lib/market/sources/context'
import { runAdapter } from '@/lib/market/sources/runner'
import type { Adapter } from '@/lib/market/sources/types'
import { nagerHolidaysAdapter } from '@/lib/market/sources/nager-holidays'
import { openMeteoAdapter } from '@/lib/market/sources/open-meteo'
import { wikipediaEventsAdapter } from '@/lib/market/sources/wikipedia-events'
import { normalizeEvents } from '@/lib/market/normalizers/events'
import { normalizeHolidays } from '@/lib/market/normalizers/holidays'
import { normalizeWeather } from '@/lib/market/normalizers/weather'

export type ActionResult = { error?: string; success?: string }

// Adapter + normalizer registry — only sources implemented in this
// PR are runnable from the admin UI. Sources awaiting API keys appear
// in the registry table as "unconfigured" until their adapter lands.
const ADAPTER_BY_SOURCE: Record<
  string,
  { adapter: Adapter; normalize?: () => Promise<number> }
> = {
  nager_holidays: { adapter: nagerHolidaysAdapter, normalize: normalizeHolidays },
  open_meteo: { adapter: openMeteoAdapter, normalize: normalizeWeather },
  wikipedia_events: { adapter: wikipediaEventsAdapter, normalize: normalizeEvents },
}

export async function toggleDataSourceAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requirePlatformAdmin()
  const source = String(formData.get('source') ?? '').trim()
  const enabled = String(formData.get('enabled') ?? 'true') === 'true'
  if (!source) return { error: 'Missing source.' }

  try {
    await setDataSourceEnabled(source, enabled)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Toggle failed.' }
  }

  revalidatePath('/admin/data-sources')
  return { success: enabled ? 'Source enabled.' : 'Source disabled.' }
}

export async function runDataSourceNowAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requirePlatformAdmin()
  const source = String(formData.get('source') ?? '').trim()
  if (!source) return { error: 'Missing source.' }

  const registry = await getDataSource(source)
  if (!registry) return { error: 'Unknown source.' }

  const entry = ADAPTER_BY_SOURCE[source]
  if (!entry) {
    return {
      error: `Adapter for "${source}" is not implemented yet. Track progress in docs/revenue-intelligence.md.`,
    }
  }

  try {
    const ctx = await buildAdapterContext()
    const result = await runAdapter(entry.adapter, ctx, { trigger: 'admin' })
    if (result.status === 'skipped') {
      return { error: `Run skipped — ${result.error_sample ?? 'reason unknown'}.` }
    }
    let normalizedNote = ''
    if (entry.normalize && result.observations_written > 0) {
      const n = await entry.normalize()
      normalizedNote = ` ${n} L2 row${n === 1 ? '' : 's'} normalized.`
    }
    revalidatePath('/admin/data-sources')
    return {
      success: `Run ${result.status} — ${result.observations_written} observations.${normalizedNote}`,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Run failed.' }
  }
}
