'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '@/lib/auth/session'
import { getDataSource, setDataSourceEnabled } from '@/lib/market/registry'
import { buildAdapterContext } from '@/lib/market/sources/context'
import { runAdapter } from '@/lib/market/sources/runner'
import type { Adapter } from '@/lib/market/sources/types'
import { bookingAffiliateAdapter } from '@/lib/market/sources/booking-affiliate'
import { eventbriteAdapter } from '@/lib/market/sources/eventbrite'
import { exchangeRateAdapter } from '@/lib/market/sources/exchange-rate'
import { expediaRapidAdapter } from '@/lib/market/sources/expedia-rapid'
import { hotelbedsAdapter } from '@/lib/market/sources/hotelbeds'
import { nagerHolidaysAdapter } from '@/lib/market/sources/nager-holidays'
import { nwsAlertsAdapter } from '@/lib/market/sources/nws-alerts'
import { openMeteoAdapter } from '@/lib/market/sources/open-meteo'
import { overpassVenuesAdapter } from '@/lib/market/sources/overpass'
import { ticketmasterAdapter } from '@/lib/market/sources/ticketmaster'
import { tripadvisorAdapter } from '@/lib/market/sources/tripadvisor'
import { wikipediaEventsAdapter } from '@/lib/market/sources/wikipedia-events'
import { wikipediaPageviewsAdapter } from '@/lib/market/sources/wikipedia-pageviews'
import { normalizeDisruptions } from '@/lib/market/normalizers/disruptions'
import { normalizeEvents } from '@/lib/market/normalizers/events'
import { normalizeFx } from '@/lib/market/normalizers/fx'
import { normalizeHolidays } from '@/lib/market/normalizers/holidays'
import { normalizeRates } from '@/lib/market/normalizers/rates'
import { normalizeReviews } from '@/lib/market/normalizers/reviews'
import { normalizeSearchDemand } from '@/lib/market/normalizers/search-demand'
import { normalizeVenues } from '@/lib/market/normalizers/venues'
import { normalizeWeather } from '@/lib/market/normalizers/weather'

export type ActionResult = { error?: string; success?: string }

// Adapter + normalizer registry — only sources implemented in this
// PR are runnable from the admin UI. Sources awaiting API keys appear
// in the registry table as "unconfigured" until their adapter lands.
const ADAPTER_BY_SOURCE: Record<
  string,
  { adapter: Adapter; normalize?: () => Promise<unknown> }
> = {
  nager_holidays: { adapter: nagerHolidaysAdapter, normalize: normalizeHolidays },
  open_meteo: { adapter: openMeteoAdapter, normalize: normalizeWeather },
  wikipedia_events: { adapter: wikipediaEventsAdapter, normalize: normalizeEvents },
  nws_alerts: { adapter: nwsAlertsAdapter, normalize: normalizeDisruptions },
  wikipedia_pageviews: { adapter: wikipediaPageviewsAdapter, normalize: normalizeSearchDemand },
  exchange_rate_host: { adapter: exchangeRateAdapter, normalize: normalizeFx },
  overpass_venues: { adapter: overpassVenuesAdapter, normalize: normalizeVenues },
  ticketmaster: { adapter: ticketmasterAdapter, normalize: normalizeEvents },
  eventbrite: { adapter: eventbriteAdapter, normalize: normalizeEvents },
  tripadvisor: { adapter: tripadvisorAdapter, normalize: normalizeReviews },
  booking_affiliate: { adapter: bookingAffiliateAdapter, normalize: normalizeRates },
  expedia_rapid: { adapter: expediaRapidAdapter, normalize: normalizeRates },
  hotelbeds: { adapter: hotelbedsAdapter, normalize: normalizeRates },
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
      // The venues normalizer returns {venues, competitors}; everything else
      // returns a number.
      if (typeof n === 'number') {
        normalizedNote = ` ${n} L2 row${n === 1 ? '' : 's'} normalized.`
      } else if (n && typeof n === 'object' && 'venues' in n && 'competitors' in n) {
        const v = (n as { venues: number; competitors: number }).venues
        const c = (n as { venues: number; competitors: number }).competitors
        normalizedNote = ` ${v} venues, ${c} competitors normalized.`
      }
    }
    revalidatePath('/admin/data-sources')
    return {
      success: `Run ${result.status} — ${result.observations_written} observations.${normalizedNote}`,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Run failed.' }
  }
}
