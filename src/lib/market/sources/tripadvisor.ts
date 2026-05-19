import type { Adapter, AdapterContext, AdapterResult, Observation } from './types'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureIsoTimestamp, hashForAnonymity, sanitizeText, stripPii } from './cleansing'

// TripAdvisor public-page scraping. Customer-consent gated: only runs
// for properties whose operator provided a tripadvisor_url on
// /market/settings. Single page per property per day; low volume,
// realistic User-Agent, no anti-scraping evasion.
//
// Strategy: extract the JSON-LD blob TripAdvisor embeds in their page
// HTML (https://schema.org/Hotel + AggregateRating + Review entries).
// Selectors won't change every week because the JSON-LD is part of
// their SEO surface.

const REVIEWER_HASH_SALT =
  process.env.PEER_HASH_SALT ?? 'myhotelops-default-salt-rotate-me-in-prod'

const POSITIVE = new Set([
  'great', 'amazing', 'love', 'loved', 'excellent', 'beautiful', 'perfect',
  'friendly', 'comfortable', 'clean', 'recommend', 'wonderful', 'fantastic',
  'helpful', 'best', 'cozy', 'charming', 'delightful', 'attentive',
])
const NEGATIVE = new Set([
  'bad', 'terrible', 'awful', 'dirty', 'rude', 'disappointing', 'noisy',
  'broken', 'cold', 'small', 'overpriced', 'worst', 'avoid', 'never',
  'unfriendly', 'slow', 'wait', 'waited', 'mold', 'smell', 'smelly',
])

export const tripadvisorAdapter: Adapter = {
  source: 'tripadvisor',
  async run(ctx: AdapterContext): Promise<AdapterResult> {
    const observations: Observation[] = []
    const errors: AdapterResult['errors'] = []
    let api_calls = 0

    // Load the customer-provided URLs from property_market_profile.
    const admin = createAdminClient()
    const propertyIds = ctx.properties.map((p) => p.id)
    if (propertyIds.length === 0) {
      return { observations, api_calls, errors }
    }
    const { data: profiles } = await admin
      .from('property_market_profile')
      .select('property_id, tripadvisor_url')
      .in('property_id', propertyIds)
      .not('tripadvisor_url', 'is', null)
    const urlByProperty = new Map<string, string>()
    for (const row of (profiles as Array<{ property_id: string; tripadvisor_url: string }> | null) ?? []) {
      if (row.tripadvisor_url) urlByProperty.set(row.property_id, row.tripadvisor_url)
    }
    if (urlByProperty.size === 0) {
      return { observations, api_calls, errors }
    }

    for (const property of ctx.properties) {
      const url = urlByProperty.get(property.id)
      if (!url) continue
      if (!isTripAdvisorUrl(url)) {
        errors.push({ message: `${property.id}: not a TripAdvisor URL` })
        continue
      }
      api_calls++
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; MyHotelOpsBot/1.0; +https://myhotelops.com/bots)',
            Accept: 'text/html,application/xhtml+xml',
          },
        })
        if (!res.ok) {
          errors.push({ message: `TripAdvisor ${property.id}: HTTP ${res.status}` })
          continue
        }
        const html = await res.text()
        const parsed = extractJsonLd(html)
        if (!parsed) {
          errors.push({ message: `TripAdvisor ${property.id}: no JSON-LD` })
          continue
        }
        // 1) Aggregate rating observation (synthetic review with no text).
        if (parsed.aggregateRating?.ratingValue) {
          observations.push({
            observed_at: ensureIsoTimestamp(new Date().toISOString(), 'now'),
            target_kind: 'review',
            target_key: `tripadvisor:agg:${property.id}:${new Date().toISOString().slice(0, 10)}`,
            property_id: property.id,
            org_id: property.org_id,
            payload: {
              target_kind: 'property',
              target_id: property.id,
              source: 'tripadvisor',
              external_id: `tripadvisor:agg:${property.id}:${new Date().toISOString().slice(0, 10)}`,
              posted_at: new Date().toISOString(),
              rating: Number(parsed.aggregateRating.ratingValue),
              text: null,
              sentiment_score: null,
              review_count: parsed.aggregateRating.reviewCount ?? null,
              best_rating: parsed.aggregateRating.bestRating ?? null,
              is_aggregate: true,
            },
            payload_raw: { source_url: url, aggregateRating: parsed.aggregateRating },
          })
        }
        // 2) Individual reviews when present.
        for (const review of parsed.review ?? []) {
          const cleansed = cleanseReview(review, property.id, property.org_id, url)
          if (cleansed) observations.push(cleansed)
        }
      } catch (err) {
        errors.push({
          message: `TripAdvisor ${property.id}: ${err instanceof Error ? err.message : err}`,
        })
      }
    }

    return { observations, api_calls, errors }
  },
}

function isTripAdvisorUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return /tripadvisor\.[a-z.]+$/i.test(u.hostname)
  } catch {
    return false
  }
}

type JsonLdHotel = {
  '@type'?: string | string[]
  aggregateRating?: { ratingValue?: number; reviewCount?: number; bestRating?: number }
  review?: Array<{
    '@type'?: string
    author?: { name?: string; '@type'?: string }
    datePublished?: string
    reviewRating?: { ratingValue?: number }
    reviewBody?: string
    name?: string
  }>
}

function extractJsonLd(html: string): JsonLdHotel | null {
  // Find every <script type="application/ld+json"> block; pick the
  // first one that has Hotel or LodgingBusiness with aggregateRating.
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = scriptRe.exec(html)) !== null) {
    const body = match[1].trim()
    try {
      const data = JSON.parse(body) as unknown
      const candidates: JsonLdHotel[] = []
      const collect = (node: unknown) => {
        if (!node || typeof node !== 'object') return
        const obj = node as Record<string, unknown>
        const type = obj['@type']
        const typeMatch =
          (typeof type === 'string' && /Hotel|LodgingBusiness|Resort/.test(type)) ||
          (Array.isArray(type) && type.some((t) => /Hotel|LodgingBusiness|Resort/.test(t)))
        if (typeMatch) candidates.push(obj as JsonLdHotel)
        if (Array.isArray(obj['@graph'])) for (const x of obj['@graph']) collect(x)
      }
      if (Array.isArray(data)) for (const x of data) collect(x)
      else collect(data)
      const hit = candidates.find((c) => c.aggregateRating) ?? candidates[0]
      if (hit) return hit
    } catch {
      // ignore malformed blocks
    }
  }
  return null
}

function cleanseReview(
  review: NonNullable<JsonLdHotel['review']>[number],
  property_id: string,
  org_id: string,
  url: string,
): Observation | null {
  const rating = typeof review.reviewRating?.ratingValue === 'number'
    ? Math.max(0, Math.min(5, review.reviewRating.ratingValue))
    : null
  const text = sanitizeText(review.reviewBody ? stripPii(review.reviewBody) : null, 8192)
  const posted_at = review.datePublished
    ? ensureIsoTimestamp(review.datePublished, 'datePublished')
    : new Date().toISOString()
  const author = review.author?.name
  const external_id = author && posted_at ? `tripadvisor:${property_id}:${posted_at}:${author}` : null
  if (!external_id) return null

  return {
    observed_at: ensureIsoTimestamp(new Date().toISOString(), 'now'),
    target_kind: 'review',
    target_key: external_id,
    property_id,
    org_id,
    payload: {
      target_kind: 'property',
      target_id: property_id,
      source: 'tripadvisor',
      external_id,
      posted_at,
      rating,
      text,
      sentiment_score: estimateSentiment(text),
      reviewer_hash: author ? hashForAnonymity(author, REVIEWER_HASH_SALT) : null,
      is_aggregate: false,
      source_url: url,
    },
    payload_raw: review as unknown as Record<string, unknown>,
  }
}

function estimateSentiment(text: string | null): number {
  if (!text) return 0
  const tokens = text.toLowerCase().split(/[^a-z']+/).filter(Boolean)
  let pos = 0
  let neg = 0
  for (const t of tokens) {
    if (POSITIVE.has(t)) pos++
    else if (NEGATIVE.has(t)) neg++
  }
  const total = pos + neg
  if (total === 0) return 0
  return Number(((pos - neg) / total).toFixed(2))
}
