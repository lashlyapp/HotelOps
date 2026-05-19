import 'server-only'
import type {
  MarketDemandSignal,
  PricingRecommendation,
  Property,
  PropertyCompetitor,
  PropertyMarketProfile,
  RecommendationType,
} from '@/lib/supabase/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney } from '@/lib/billing/currency'

// ADR figures in this module are whole-currency-units (dollars), not
// cents — they come from numeric(10,2) columns. `formatMoney` is
// cents-denominated, so we multiply by 100 at the boundary.

// Recommendation engine. Strategic principle from the spec:
//
//   "The value comes from clarity and confidence, NOT forecasting
//    complexity."
//
// Rules in v1:
//
//   - Each upcoming demand signal at intensity >= 3 produces a
//     rate_increase recommendation for its date.
//   - A "weekend lift" rate_increase fires for the next Saturday if
//     no stronger demand signal already covers it.
//   - A parity_alert fires when the property's profile ADR floor is
//     materially below the median competitor floor (>= 12%).
//   - A visibility_gap fires once per refresh for property variety
//     ("Friday OTA pricing parity warrants a check").
//
// All recommendations are upserted on (property, target_date,
// recommendation_key) so a re-run reconciles cleanly.

const MIN_COMPETITOR_GAP_PCT = 0.12

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function nextSaturday(today: string): string {
  const d = new Date(today + 'T00:00:00Z')
  const day = d.getUTCDay() // 0=Sun, 6=Sat
  let offset = (6 - day + 7) % 7
  if (offset === 0) offset = 7
  return addDays(today, offset)
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function formatCurrency(amount: number, currency: string): string {
  // Use unknown→string cast: the org currency column is constrained
  // to the SUPPORTED_CURRENCIES set already.
  return formatMoney(Math.round(amount * 100), currency as Parameters<typeof formatMoney>[1])
}

export async function refreshPricingRecommendations(
  property: Property,
  profile: PropertyMarketProfile,
  signals: MarketDemandSignal[],
  competitors: PropertyCompetitor[],
  currency: string,
  options: { today?: string } = {},
): Promise<PricingRecommendation[]> {
  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const admin = createAdminClient()

  type Row = Omit<PricingRecommendation, 'id' | 'created_at' | 'acted_at'> & {
    acted_at?: string | null
  }
  const rows: Row[] = []

  // 1) Per-signal lift recommendations.
  for (const signal of signals) {
    if (signal.signal_date <= today) continue
    if (signal.intensity < 3) continue
    const baseFloor = profile.adr_floor ?? 219
    const lift = Math.round(baseFloor * (0.04 + signal.intensity * 0.03))
    rows.push({
      property_id: property.id,
      org_id: property.org_id,
      target_date: signal.signal_date,
      recommendation_key: `signal_lift:${signal.signal_key}`,
      recommendation_type: 'rate_increase',
      headline: `Consider lifting ${signal.signal_date} rates by ${formatCurrency(lift, currency)}.`,
      rationale: `${signal.headline} Comparable properties typically reprice ahead of this kind of demand event.`,
      suggested_delta: lift,
      priority: Math.min(5, signal.intensity),
      confidence: signal.confidence,
      contributing_signals: [`demand_signal:${signal.id}`],
    })
  }

  // 2) Weekend lift if next Saturday isn't already covered.
  const saturday = nextSaturday(today)
  const saturdayCovered = rows.some((r) => r.target_date === saturday)
  if (!saturdayCovered) {
    const baseFloor = profile.adr_floor ?? 219
    const lift = Math.round(baseFloor * 0.08)
    rows.push({
      property_id: property.id,
      org_id: property.org_id,
      target_date: saturday,
      recommendation_key: 'weekend_lift',
      recommendation_type: 'rate_increase',
      headline: `Saturday pricing appears low relative to weekend demand patterns.`,
      rationale: `Consider raising Saturday rates by ${formatCurrency(lift, currency)}; comparable properties consistently sustain higher weekend ADRs in this segment.`,
      suggested_delta: lift,
      priority: 3,
      confidence: 'medium',
      contributing_signals: [],
    })
  }

  // 3) Parity alert vs the comp set.
  const compFloors = competitors
    .map((c) => c.adr_floor)
    .filter((v): v is number => typeof v === 'number')
  if (compFloors.length >= 3 && profile.adr_floor != null) {
    const med = median(compFloors)
    const gap = (med - profile.adr_floor) / med
    if (gap >= MIN_COMPETITOR_GAP_PCT) {
      const lift = Math.round(med - profile.adr_floor)
      rows.push({
        property_id: property.id,
        org_id: property.org_id,
        target_date: addDays(today, 1),
        recommendation_key: 'comp_parity_gap',
        recommendation_type: 'parity_alert',
        headline: `Floor rate is ${Math.round(gap * 100)}% below comparable properties.`,
        rationale: `Median comp-set floor is ${formatCurrency(med, currency)} vs. your ${formatCurrency(profile.adr_floor, currency)}. Consider a ${formatCurrency(lift, currency)} bump or revisit your positioning.`,
        suggested_delta: lift,
        priority: 4,
        confidence: 'medium',
        contributing_signals: competitors.slice(0, 3).map((c) => `competitor:${c.id}`),
      })
    }
  }

  // 4) Visibility / parity check — one per refresh for awareness.
  rows.push({
    property_id: property.id,
    org_id: property.org_id,
    target_date: addDays(today, 2),
    recommendation_key: 'visibility_check',
    recommendation_type: 'visibility_gap',
    headline: `Confirm OTA rate parity for the upcoming weekend.`,
    rationale: `Periodic parity check — comparable properties have been adjusting weekend rates; spot-check Booking.com and Expedia for any drift.`,
    suggested_delta: null,
    priority: 2,
    confidence: 'low',
    contributing_signals: [],
  })

  if (rows.length > 0) {
    const { error } = await admin
      .from('pricing_recommendations')
      .upsert(rows, {
        onConflict: 'property_id,target_date,recommendation_key',
        ignoreDuplicates: false,
      })
    if (error) throw new Error(`refreshPricingRecommendations: ${error.message}`)
  }

  const { data, error: readErr } = await admin
    .from('pricing_recommendations')
    .select('*')
    .eq('property_id', property.id)
    .gte('target_date', today)
    .order('priority', { ascending: false })
    .order('target_date', { ascending: true })
  if (readErr) throw new Error(`refreshPricingRecommendations read: ${readErr.message}`)
  return (data as PricingRecommendation[] | null) ?? []
}

export function typeLabel(t: RecommendationType): string {
  switch (t) {
    case 'rate_increase':
      return 'Rate opportunity'
    case 'rate_hold':
      return 'Rate hold'
    case 'rate_decrease':
      return 'Soften pricing'
    case 'parity_alert':
      return 'Parity alert'
    case 'visibility_gap':
      return 'Visibility check'
  }
}
