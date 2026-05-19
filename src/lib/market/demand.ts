import 'server-only'
import type {
  DemandSignalType,
  MarketDemandSignal,
  Property,
  PropertyMarketProfile,
  SignalConfidence,
} from '@/lib/supabase/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { seededRandom } from './random'

// Forward-looking demand signals. v1 is heuristic — driven by weekend
// detection, US public holidays, and a deterministic synthetic event
// stream so a fresh property's /market screen still feels alive on
// day one. The shape matches what a real conventions/events feed will
// populate later (see the comment in the migration).

const SIGNAL_TEMPLATES: Array<{
  type: DemandSignalType
  key: string
  headline: (location: string) => string
  intensity: number
  confidence: SignalConfidence
}> = [
  {
    type: 'convention',
    key: 'downtown_tech_summit',
    headline: (loc) => `Large tech convention in ${loc}; expect compressed mid-week occupancy.`,
    intensity: 4,
    confidence: 'high',
  },
  {
    type: 'convention',
    key: 'medical_assoc_meeting',
    headline: (loc) => `Regional medical association meeting near ${loc}.`,
    intensity: 3,
    confidence: 'medium',
  },
  {
    type: 'concert',
    key: 'arena_residency_weekend',
    headline: (loc) => `Major concert weekend at the ${loc} arena; nearby hotels filling fast.`,
    intensity: 4,
    confidence: 'high',
  },
  {
    type: 'concert',
    key: 'midweek_show',
    headline: () => `Midweek concert at the downtown venue.`,
    intensity: 2,
    confidence: 'medium',
  },
  {
    type: 'sports',
    key: 'home_game_weekend',
    headline: () => `Home game weekend; visiting-team demand likely.`,
    intensity: 3,
    confidence: 'medium',
  },
  {
    type: 'festival',
    key: 'food_and_wine',
    headline: (loc) => `${loc} food & wine festival running through the weekend.`,
    intensity: 3,
    confidence: 'medium',
  },
  {
    type: 'festival',
    key: 'arts_walk',
    headline: (loc) => `${loc} arts walk Saturday evening; expect higher walk-in interest.`,
    intensity: 2,
    confidence: 'low',
  },
  {
    type: 'seasonal',
    key: 'shoulder_softness',
    headline: () => `Market entering shoulder week; comparable properties softening rates.`,
    intensity: 2,
    confidence: 'medium',
  },
  {
    type: 'compression',
    key: 'comp_set_near_sellout',
    headline: () => `Comparable properties appear close to sellout for the upcoming weekend.`,
    intensity: 4,
    confidence: 'medium',
  },
]

// US public holidays (subset). The "holiday" generator picks any in the
// next 21 days. Dates in 2026 are hard-coded for v1; a real
// implementation would derive them per locale.
const HOLIDAYS_2026: Array<{ date: string; name: string }> = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-01-19', name: 'Martin Luther King Jr. Day' },
  { date: '2026-02-16', name: "Presidents' Day" },
  { date: '2026-05-25', name: 'Memorial Day' },
  { date: '2026-07-04', name: 'Independence Day' },
  { date: '2026-09-07', name: 'Labor Day' },
  { date: '2026-10-12', name: 'Columbus Day' },
  { date: '2026-11-11', name: 'Veterans Day' },
  { date: '2026-11-26', name: 'Thanksgiving' },
  { date: '2026-12-25', name: 'Christmas Day' },
]

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function isWeekend(iso: string): boolean {
  const d = new Date(iso + 'T00:00:00Z').getUTCDay()
  return d === 5 || d === 6
}

export async function refreshDemandSignals(
  property: Property,
  profile: PropertyMarketProfile,
  options: { today?: string; horizonDays?: number } = {},
): Promise<MarketDemandSignal[]> {
  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const horizonDays = options.horizonDays ?? 21
  const location =
    profile.location_descriptor ?? property.city ?? 'the local market'
  const admin = createAdminClient()

  type Row = Omit<MarketDemandSignal, 'id' | 'created_at'>
  const rows: Row[] = []

  // Holiday band — anything within the horizon.
  for (const h of HOLIDAYS_2026) {
    if (h.date < today) continue
    if (h.date > addDays(today, horizonDays)) continue
    rows.push({
      property_id: property.id,
      org_id: property.org_id,
      signal_date: h.date,
      signal_key: `holiday:${h.name.toLowerCase().replace(/[^a-z]+/g, '_')}`,
      signal_type: 'holiday',
      headline: `${h.name} — historically a high-demand date for ${location}.`,
      intensity: 4,
      confidence: 'high',
      context: { holiday: h.name },
    })
  }

  // Synthetic event stream — pick 4-6 templates and place them
  // deterministically across the next 14 days. Keyed off the
  // property id so the schedule is stable per property.
  const rng = seededRandom(`signals:${property.id}:${today}`)
  const targetCount = 4 + Math.floor(rng() * 3)
  const usedKeys = new Set<string>()
  for (let i = 0; i < 30 && usedKeys.size < targetCount; i++) {
    const tpl = SIGNAL_TEMPLATES[Math.floor(rng() * SIGNAL_TEMPLATES.length)]
    if (usedKeys.has(tpl.key)) continue
    usedKeys.add(tpl.key)

    let dayOffset = 1 + Math.floor(rng() * (horizonDays - 1))
    // Anchor weekend-y templates to a Fri/Sat for realism.
    if (
      tpl.key.includes('weekend') ||
      tpl.type === 'sports' ||
      tpl.type === 'concert'
    ) {
      for (let bump = 0; bump < 7; bump++) {
        if (isWeekend(addDays(today, dayOffset))) break
        dayOffset = (dayOffset + 1) % horizonDays
        if (dayOffset === 0) dayOffset = 1
      }
    }
    rows.push({
      property_id: property.id,
      org_id: property.org_id,
      signal_date: addDays(today, dayOffset),
      signal_key: tpl.key,
      signal_type: tpl.type,
      headline: tpl.headline(location),
      intensity: tpl.intensity,
      confidence: tpl.confidence,
      context: {},
    })
  }

  if (rows.length === 0) return []

  const { error } = await admin
    .from('market_demand_signals')
    .upsert(rows, {
      onConflict: 'property_id,signal_date,signal_key',
      ignoreDuplicates: false,
    })
  if (error) throw new Error(`refreshDemandSignals: ${error.message}`)

  const { data, error: readErr } = await admin
    .from('market_demand_signals')
    .select('*')
    .eq('property_id', property.id)
    .gte('signal_date', today)
    .lte('signal_date', addDays(today, horizonDays))
    .order('signal_date', { ascending: true })
  if (readErr) throw new Error(`refreshDemandSignals read: ${readErr.message}`)
  return (data as MarketDemandSignal[] | null) ?? []
}
