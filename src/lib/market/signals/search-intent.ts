import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildCityKey } from '@/lib/market/sources/cleansing'
import type { Property } from '@/lib/supabase/types'

// Build search_intent_signals from Wikipedia pageviews. v1 metric:
// 7-day rolling average vs 28-day rolling average → wow_change_pct.
// Year-over-year requires >1 year of data; left null until then.

export async function buildSearchIntentSignals(property: Property): Promise<boolean> {
  const admin = createAdminClient()
  const city_key = buildCityKey({
    city: property.city,
    state: property.state,
    country: property.country,
  })
  if (!city_key) return false

  const today = new Date()
  const cutoff28 = addDays(today, -28).toISOString().slice(0, 10)

  const { data } = await admin
    .from('search_demand_observations')
    .select('measurement_date, score')
    .eq('geo_key', city_key)
    .eq('source', 'wikipedia_pageviews')
    .gte('measurement_date', cutoff28)
    .order('measurement_date', { ascending: false })
    .limit(60)

  const rows = (data as Array<{ measurement_date: string; score: number }> | null) ?? []
  if (rows.length === 0) return false

  const seven = rows.slice(0, 7)
  const twentyEight = rows.slice(0, 28)
  const avg = (xs: { score: number }[]) =>
    xs.length === 0 ? 0 : xs.reduce((s, x) => s + Number(x.score), 0) / xs.length
  const avg7 = avg(seven)
  const avg28 = avg(twentyEight)
  const wow = avg28 === 0 ? 0 : ((avg7 - avg28) / avg28) * 100

  // Normalize: cap raw pageviews to a 0-100 score so the UI surface
  // is consistent across small towns and major cities.
  const score = Math.min(100, Math.log10(avg7 + 1) * 25)

  const { error } = await admin
    .from('search_intent_signals')
    .upsert(
      {
        property_id: property.id,
        org_id: property.org_id,
        observed_at: new Date().toISOString(),
        destination_demand_score: Number(score.toFixed(2)),
        wow_change_pct: Number(wow.toFixed(2)),
        yoy_change_pct: null,
        pageview_avg_7d: Number(avg7.toFixed(2)),
        pageview_avg_28d: Number(avg28.toFixed(2)),
        trending_up: wow >= 10,
      },
      { onConflict: 'property_id,observed_at', ignoreDuplicates: false },
    )
  if (error) throw new Error(`buildSearchIntentSignals: ${error.message}`)
  return true
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime())
  out.setUTCDate(out.getUTCDate() + n)
  return out
}
