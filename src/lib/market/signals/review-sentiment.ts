import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Property } from '@/lib/supabase/types'

// Build review_sentiment_signals for a property. Rolls up
// review_observations into a 30-day window snapshot:
//   - rating_avg
//   - delta vs previous 30-day window
//   - top complaint / praise theme (top keyword from negative /
//     positive reviews)
//   - competitor comparison (median of comp set's review averages)

export async function buildReviewSentimentSignals(property: Property): Promise<boolean> {
  const admin = createAdminClient()
  const now = new Date()
  const cutoff30 = addDays(now, -30).toISOString()
  const cutoff60 = addDays(now, -60).toISOString()

  const { data: window30 } = await admin
    .from('review_observations')
    .select('rating, sentiment_score, text, posted_at')
    .eq('target_kind', 'property')
    .eq('target_id', property.id)
    .gte('posted_at', cutoff30)
  const reviews30 = (window30 as ReviewRow[] | null) ?? []
  if (reviews30.length === 0) return false

  const { data: window3060 } = await admin
    .from('review_observations')
    .select('rating, sentiment_score')
    .eq('target_kind', 'property')
    .eq('target_id', property.id)
    .gte('posted_at', cutoff60)
    .lt('posted_at', cutoff30)
  const reviews3060 = (window3060 as ReviewRow[] | null) ?? []

  const ratingAvg = avg(reviews30.map((r) => r.rating).filter(isNum))
  const ratingPrev = avg(reviews3060.map((r) => r.rating).filter(isNum))
  const sentimentAvg = avg(reviews30.map((r) => r.sentiment_score).filter(isNum))
  const ratingDelta = ratingPrev > 0 ? ratingAvg - ratingPrev : null

  const themes = extractThemes(reviews30)

  // Competitor comparison — median of recent competitor review averages.
  const { data: competitors } = await admin
    .from('property_competitor_set')
    .select('id')
    .eq('property_id', property.id)
  const competitorIds = ((competitors as { id: string }[] | null) ?? []).map((c) => c.id)
  let competitorAvg: number | null = null
  let vsCompetitorDelta: number | null = null
  if (competitorIds.length > 0) {
    const { data: compReviews } = await admin
      .from('review_observations')
      .select('target_id, rating')
      .eq('target_kind', 'competitor')
      .in('target_id', competitorIds)
      .gte('posted_at', cutoff30)
    const perComp = new Map<string, number[]>()
    for (const r of (compReviews as Array<{ target_id: string; rating: number | null }> | null) ?? []) {
      if (!isNum(r.rating)) continue
      const list = perComp.get(r.target_id) ?? []
      list.push(r.rating!)
      perComp.set(r.target_id, list)
    }
    const compAverages = [...perComp.values()].map(avg).filter((n) => n > 0)
    if (compAverages.length > 0) {
      competitorAvg = median(compAverages)
      vsCompetitorDelta = ratingAvg - competitorAvg
    }
  }

  const { error } = await admin
    .from('review_sentiment_signals')
    .upsert(
      {
        property_id: property.id,
        org_id: property.org_id,
        observed_at: new Date().toISOString(),
        window_days: 30,
        rating_avg: round1(ratingAvg),
        rating_delta_vs_prev: ratingDelta == null ? null : round2(ratingDelta),
        review_count_window: reviews30.length,
        sentiment_avg: round2(sentimentAvg),
        top_complaint_theme: themes.complaint,
        top_praise_theme: themes.praise,
        competitor_avg: competitorAvg == null ? null : round1(competitorAvg),
        vs_competitor_delta: vsCompetitorDelta == null ? null : round2(vsCompetitorDelta),
      },
      { onConflict: 'property_id,observed_at,window_days', ignoreDuplicates: false },
    )
  if (error) throw new Error(`buildReviewSentimentSignals: ${error.message}`)
  return true
}

type ReviewRow = {
  rating: number | null
  sentiment_score: number | null
  text: string | null
  posted_at: string | null
}

const STOPWORDS = new Set([
  'the', 'and', 'was', 'were', 'this', 'that', 'with', 'for', 'have', 'had',
  'they', 'are', 'has', 'but', 'our', 'their', 'from', 'will', 'all', 'one',
  'not', 'you', 'your', 'his', 'her', 'she', 'him', 'them', 'who', 'what',
  'when', 'where', 'how', 'why', 'which', 'there', 'here', 'just', 'very',
  'really', 'also', 'into', 'about', 'than', 'then', 'some', 'more', 'most',
  'such', 'only', 'over', 'after', 'before', 'while', 'because', 'would',
  'could', 'should', 'been', 'being', 'does', 'did', 'doing', 'done',
  'hotel', 'room', 'stay', 'stayed', 'place', 'time', 'night', 'nights',
])

function extractThemes(reviews: ReviewRow[]): { complaint: string | null; praise: string | null } {
  const negTokens: string[] = []
  const posTokens: string[] = []
  for (const r of reviews) {
    if (!r.text || !isNum(r.sentiment_score)) continue
    const tokens = r.text.toLowerCase().split(/[^a-z']+/).filter((t) => t.length >= 4 && !STOPWORDS.has(t))
    if (r.sentiment_score! < -0.2) negTokens.push(...tokens)
    else if (r.sentiment_score! > 0.2) posTokens.push(...tokens)
  }
  return {
    complaint: topToken(negTokens),
    praise: topToken(posTokens),
  }
}

function topToken(tokens: string[]): string | null {
  if (tokens.length === 0) return null
  const counts = new Map<string, number>()
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1)
  let best: string | null = null
  let bestCount = 0
  for (const [t, c] of counts) {
    if (c > bestCount) {
      best = t
      bestCount = c
    }
  }
  return bestCount >= 2 ? best : null
}

function isNum(v: number | null): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

function round1(n: number): number {
  return Number(n.toFixed(1))
}
function round2(n: number): number {
  return Number(n.toFixed(2))
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime())
  out.setUTCDate(out.getUTCDate() + n)
  return out
}
