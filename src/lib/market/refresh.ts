import 'server-only'
import type {
  DailyMarketBriefing,
  MarketDemandSignal,
  Organization,
  PricingRecommendation,
  Property,
  PropertyCompetitor,
  PropertyMarketProfile,
} from '@/lib/supabase/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { composeAndStoreBriefing } from './briefing'
import { detectAndStoreCompetitors } from './competitors'
import { refreshDemandSignals } from './demand'
import { detectAndStoreMarketProfile } from './profile'
import { refreshPricingRecommendations } from './recommendations'
import { buildDemandSignalsFromRealData } from './signals/demand'
import { buildReviewSentimentSignals } from './signals/review-sentiment'
import { buildSearchIntentSignals } from './signals/search-intent'
import { buildWeatherDisruptionSignals } from './signals/weather-disruption'

export type MarketIntelligenceBundle = {
  profile: PropertyMarketProfile
  competitors: PropertyCompetitor[]
  signals: MarketDemandSignal[]
  recommendations: PricingRecommendation[]
  briefing: DailyMarketBriefing
}

// Idempotent end-to-end refresh. Called on first /market visit per
// property per day (the page checks "is there a briefing for today?"
// and triggers this if not). Strategic intent: the GM never sees
// "configure your comp set" — they land on /market and the page is
// already populated.
export async function refreshMarketIntelligence(
  property: Property,
  organization: Pick<Organization, 'currency'>,
  options: { today?: string } = {},
): Promise<MarketIntelligenceBundle> {
  const profile = await detectAndStoreMarketProfile(property)
  const competitors = await detectAndStoreCompetitors(property, profile)
  // Prefer real signals built from L2 (events_catalog + holidays_catalog
  // + weather_observations). Fall back to the v1 heuristic generator
  // when L2 has nothing for this property's geo, so /market is never
  // empty before sources are wired up.
  const realSignals = await buildDemandSignalsFromRealData(property, profile, {
    today: options.today,
  })
  const signals = realSignals.length > 0
    ? realSignals
    : await refreshDemandSignals(property, profile, { today: options.today })

  // Best-effort: build the auxiliary signals (weather disruptions,
  // search intent, review sentiment) when their data is available.
  // Failures here don't block /market — the briefing degrades to
  // "data not yet available" rather than throwing.
  await Promise.allSettled([
    buildWeatherDisruptionSignals(property, { today: options.today }),
    buildSearchIntentSignals(property),
    buildReviewSentimentSignals(property),
  ])
  const recommendations = await refreshPricingRecommendations(
    property,
    profile,
    signals,
    competitors,
    organization.currency,
    { today: options.today },
  )
  const briefing = await composeAndStoreBriefing(
    property,
    profile,
    competitors,
    signals,
    recommendations,
    { today: options.today },
  )
  return { profile, competitors, signals, recommendations, briefing }
}

// Read-only fetch — returns everything if today's briefing exists,
// otherwise returns null and the page calls refreshMarketIntelligence.
export async function loadMarketBundleForToday(
  property: Property,
  today: string,
): Promise<MarketIntelligenceBundle | null> {
  const admin = createAdminClient()
  const [
    profileQ,
    briefingQ,
    competitorsQ,
    signalsQ,
    recsQ,
  ] = await Promise.all([
    admin
      .from('property_market_profile')
      .select('*')
      .eq('property_id', property.id)
      .maybeSingle<PropertyMarketProfile>(),
    admin
      .from('daily_market_briefings')
      .select('*')
      .eq('property_id', property.id)
      .eq('briefing_date', today)
      .maybeSingle<DailyMarketBriefing>(),
    admin
      .from('property_competitor_set')
      .select('*')
      .eq('property_id', property.id)
      .order('match_score', { ascending: false }),
    admin
      .from('market_demand_signals')
      .select('*')
      .eq('property_id', property.id)
      .gte('signal_date', today)
      .order('signal_date', { ascending: true }),
    admin
      .from('pricing_recommendations')
      .select('*')
      .eq('property_id', property.id)
      .gte('target_date', today)
      .order('priority', { ascending: false })
      .order('target_date', { ascending: true }),
  ])

  const profile = profileQ.data
  const briefing = briefingQ.data
  if (!profile || !briefing) return null
  return {
    profile,
    briefing,
    competitors: (competitorsQ.data as PropertyCompetitor[] | null) ?? [],
    signals: (signalsQ.data as MarketDemandSignal[] | null) ?? [],
    recommendations: (recsQ.data as PricingRecommendation[] | null) ?? [],
  }
}
