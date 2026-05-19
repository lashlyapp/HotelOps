import 'server-only'
import type {
  DailyMarketBriefing,
  DemandOutlook,
  MarketDemandSignal,
  PricingRecommendation,
  Property,
  PropertyCompetitor,
  PropertyMarketProfile,
  ReviewSentimentSignal,
} from '@/lib/supabase/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { polishBriefingWithAi } from './briefing-ai'

// Compose the top-of-page executive briefing. Strategic principle:
//
//   "What should this hotel pay attention to today?"
//
// Not analysis. Not charts. One sentence at the top + 2-3 short
// paragraphs the GM can read on their phone with one coffee.

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function classifyOutlook(
  signals: MarketDemandSignal[],
  recs: PricingRecommendation[],
  today: string,
): DemandOutlook {
  const horizon = addDays(today, 7)
  const upcomingHigh = signals.filter(
    (s) => s.signal_date >= today && s.signal_date <= horizon && s.intensity >= 4,
  ).length
  const compressionFlag = signals.some(
    (s) => s.signal_type === 'compression' && s.signal_date >= today && s.signal_date <= horizon,
  )
  if (compressionFlag || upcomingHigh >= 3) return 'compressed'
  if (upcomingHigh >= 1) return 'strong'
  const lifts = recs.filter(
    (r) => r.recommendation_type === 'rate_increase' && r.target_date <= horizon,
  ).length
  if (lifts >= 2) return 'strong'
  if (lifts === 0) return 'soft'
  return 'steady'
}

function composeHeadline(
  profile: PropertyMarketProfile,
  outlook: DemandOutlook,
  upcoming: MarketDemandSignal[],
  topRec: PricingRecommendation | null,
): string {
  const top = upcoming[0]
  switch (outlook) {
    case 'compressed':
      return top
        ? `Demand is compressing around ${top.signal_date} — comp set is filling and pricing should follow.`
        : `Market demand is compressing this week — comp set is filling and pricing should follow.`
    case 'strong':
      if (topRec?.recommendation_type === 'rate_increase') {
        return topRec.headline
      }
      return top
        ? `Strong demand window forming around ${top.signal_date}.`
        : `Strong demand window forming over the next several days.`
    case 'soft':
      return `Market is in a softer shoulder window — focus on visibility and parity rather than rate cuts.`
    case 'steady':
    default:
      return topRec
        ? topRec.headline
        : `Market conditions look steady; a couple of small pricing opportunities to review.`
  }
}

function composeBody(
  profile: PropertyMarketProfile,
  competitors: PropertyCompetitor[],
  upcoming: MarketDemandSignal[],
  recs: PricingRecommendation[],
): string {
  const paragraphs: string[] = []
  const location = profile.location_descriptor ?? 'your market'

  // Demand paragraph.
  if (upcoming.length > 0) {
    const top = upcoming.slice(0, 2).map((s) => s.headline).join(' ')
    paragraphs.push(`Demand outlook: ${top}`)
  } else {
    paragraphs.push(
      `Demand outlook: no major events detected near ${location} in the next week. Expect typical seasonal patterns.`,
    )
  }

  // Competitor paragraph.
  if (competitors.length > 0) {
    const sample = competitors.slice(0, 3).map((c) => c.competitor_name).join(', ')
    paragraphs.push(
      `Competitor movement: tracking ${competitors.length} comparable propert${competitors.length === 1 ? 'y' : 'ies'} including ${sample}. Comp-set rates and availability are surfaced on the Competitors tab when they shift meaningfully.`,
    )
  }

  // Recommendation paragraph.
  const activeRecs = recs.filter((r) => !r.acted_at).slice(0, 3)
  if (activeRecs.length > 0) {
    const lines = activeRecs.map((r) => `• ${r.headline}`).join('\n')
    paragraphs.push(`Opportunities for today:\n${lines}`)
  } else {
    paragraphs.push(
      `Opportunities for today: nothing flagged — pricing and visibility look in line with the market.`,
    )
  }

  return paragraphs.join('\n\n')
}

export async function composeAndStoreBriefing(
  property: Property,
  profile: PropertyMarketProfile,
  competitors: PropertyCompetitor[],
  signals: MarketDemandSignal[],
  recommendations: PricingRecommendation[],
  options: { today?: string } = {},
): Promise<DailyMarketBriefing> {
  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const horizon = addDays(today, 7)
  const upcoming = signals
    .filter((s) => s.signal_date >= today && s.signal_date <= horizon)
    .sort((a, b) => b.intensity - a.intensity)

  const outlook = classifyOutlook(signals, recommendations, today)
  const topRec = recommendations.find((r) => !r.acted_at) ?? null

  let headline = composeHeadline(profile, outlook, upcoming, topRec)
  let body = composeBody(profile, competitors, upcoming, recommendations)

  // Best-effort AI polish — returns null when OPENAI_API_KEY is
  // missing or the call fails. Numbers/facts come from the rule-based
  // composer above; the model only rewords.
  const admin = createAdminClient()
  const { data: reviewSignal } = await admin
    .from('review_sentiment_signals')
    .select('*')
    .eq('property_id', property.id)
    .order('observed_at', { ascending: false })
    .limit(1)
    .maybeSingle<ReviewSentimentSignal>()

  const polished = await polishBriefingWithAi({
    property,
    profile,
    draftHeadline: headline,
    draftBody: body,
    outlook,
    topSignals: upcoming,
    topRecommendations: recommendations.filter((r) => !r.acted_at).slice(0, 4),
    reviewSignal: reviewSignal ?? null,
  })
  if (polished) {
    headline = polished.headline
    body = polished.body
  }

  const opportunity_count = recommendations.filter(
    (r) => !r.acted_at && (r.recommendation_type === 'rate_increase' || r.recommendation_type === 'rate_hold'),
  ).length
  const alert_count = recommendations.filter(
    (r) => !r.acted_at && (r.recommendation_type === 'parity_alert' || r.recommendation_type === 'visibility_gap'),
  ).length

  const source_signal_ids = upcoming.slice(0, 4).map((s) => s.id)

  const { data, error } = await admin
    .from('daily_market_briefings')
    .upsert(
      {
        property_id: property.id,
        org_id: property.org_id,
        briefing_date: today,
        headline,
        body,
        opportunity_count,
        alert_count,
        demand_outlook: outlook,
        source_signal_ids,
      },
      { onConflict: 'property_id,briefing_date' },
    )
    .select('*')
    .single<DailyMarketBriefing>()
  if (error || !data) {
    throw new Error(`composeAndStoreBriefing: ${error?.message ?? 'no row'}`)
  }
  return data
}
