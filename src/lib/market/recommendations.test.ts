import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  MarketDemandSignal,
  Property,
  PropertyCompetitor,
  PropertyMarketProfile,
} from '@/lib/supabase/types'
import { evaluateRecommendationRules } from './recommendations'

const property: Property = {
  id: 'prop_test',
  org_id: 'org_test',
  slug: 'test-hotel',
  name: 'Test Hotel',
  r2_prefix: 'tests/',
  created_at: '2026-01-01T00:00:00Z',
  address_line1: '1 Main St',
  address_line2: null,
  city: 'Charleston',
  state: 'SC',
  postal_code: '29401',
  country: 'US',
  phone: null,
  email: null,
  website: null,
  description: null,
  logo_key: null,
  logo_uploaded_at: null,
  storage_used_bytes: 0,
  storage_used_at: null,
  storage_quota_bytes: 10_000_000_000,
}

const profile: PropertyMarketProfile = {
  property_id: 'prop_test',
  org_id: 'org_test',
  market_segment: 'boutique',
  tier: 4,
  adr_floor: 220,
  adr_ceiling: 340,
  location_descriptor: 'Downtown Charleston',
  amenity_tags: 'rooftop_bar,spa',
  operator_confirmed: true,
  detected_at: '2026-05-19T00:00:00Z',
  updated_at: '2026-05-19T00:00:00Z',
  tripadvisor_url: null,
  google_place_id: null,
}

function signal(overrides: Partial<MarketDemandSignal>): MarketDemandSignal {
  return {
    id: 'signal_test',
    property_id: 'prop_test',
    org_id: 'org_test',
    signal_date: '2026-05-23',
    signal_key: 'event:test:1',
    signal_type: 'festival',
    headline: 'Test festival',
    intensity: 4,
    confidence: 'high',
    context: {},
    created_at: '2026-05-19T00:00:00Z',
    ...overrides,
  }
}

function competitor(overrides: Partial<PropertyCompetitor>): PropertyCompetitor {
  return {
    id: 'comp_test',
    property_id: 'prop_test',
    org_id: 'org_test',
    competitor_name: 'Comp Hotel',
    archetype: 'similar_boutique',
    distance_km: 1.0,
    adr_floor: 300,
    adr_ceiling: 400,
    match_score: 90,
    external_source: 'osm',
    external_id: null,
    created_at: '2026-05-19T00:00:00Z',
    ...overrides,
  }
}

const baseArgs = {
  property,
  profile,
  currency: 'usd',
  today: '2026-05-19',
}

describe('evaluateRecommendationRules', () => {
  it('emits a per-signal lift for upcoming intensity-3+ signals', () => {
    const rows = evaluateRecommendationRules({
      ...baseArgs,
      signals: [signal({ signal_date: '2026-05-23', intensity: 4 })],
      competitors: [],
      parity: [],
      compression: [],
    })
    const lift = rows.find((r) => r.recommendation_key.startsWith('signal_lift:'))
    assert.ok(lift, 'expected a signal_lift row')
    assert.equal(lift?.recommendation_type, 'rate_increase')
    assert.equal(lift?.target_date, '2026-05-23')
    assert.ok((lift?.suggested_delta ?? 0) > 0)
  })

  it('skips signals already in the past', () => {
    const rows = evaluateRecommendationRules({
      ...baseArgs,
      signals: [signal({ signal_date: '2026-05-18', intensity: 5 })],
      competitors: [],
      parity: [],
      compression: [],
    })
    assert.equal(
      rows.find((r) => r.recommendation_key.startsWith('signal_lift:')),
      undefined,
    )
  })

  it('skips low-intensity signals', () => {
    const rows = evaluateRecommendationRules({
      ...baseArgs,
      signals: [signal({ intensity: 2 })],
      competitors: [],
      parity: [],
      compression: [],
    })
    assert.equal(
      rows.find((r) => r.recommendation_key.startsWith('signal_lift:')),
      undefined,
    )
  })

  it('emits a weekend_lift when no signal covers next Saturday', () => {
    const rows = evaluateRecommendationRules({
      ...baseArgs,
      // 2026-05-19 is a Tuesday → next Saturday = 2026-05-23.
      signals: [],
      competitors: [],
      parity: [],
      compression: [],
    })
    const weekend = rows.find((r) => r.recommendation_key === 'weekend_lift')
    assert.ok(weekend)
    assert.equal(weekend?.target_date, '2026-05-23')
  })

  it('suppresses weekend_lift when a signal already covers Saturday', () => {
    const rows = evaluateRecommendationRules({
      ...baseArgs,
      signals: [signal({ signal_date: '2026-05-23', intensity: 4 })],
      competitors: [],
      parity: [],
      compression: [],
    })
    assert.equal(rows.find((r) => r.recommendation_key === 'weekend_lift'), undefined)
  })

  it('emits a heuristic comp_parity_gap when comp_floor median is materially above our floor', () => {
    const rows = evaluateRecommendationRules({
      ...baseArgs,
      signals: [],
      competitors: [
        competitor({ id: 'c1', adr_floor: 280 }),
        competitor({ id: 'c2', adr_floor: 300 }),
        competitor({ id: 'c3', adr_floor: 320 }),
      ],
      parity: [],
      compression: [],
    })
    const parity = rows.find((r) => r.recommendation_key === 'comp_parity_gap')
    assert.ok(parity)
    assert.equal(parity?.recommendation_type, 'parity_alert')
    assert.equal(parity?.priority, 4)
  })

  it('does NOT emit a heuristic parity gap when there are < 3 competitor floors', () => {
    const rows = evaluateRecommendationRules({
      ...baseArgs,
      signals: [],
      competitors: [competitor({ id: 'c1', adr_floor: 400 })],
      parity: [],
      compression: [],
    })
    assert.equal(rows.find((r) => r.recommendation_key === 'comp_parity_gap'), undefined)
  })

  it('emits a real_parity_gap (priority 5) when gap_pct ≤ -18%', () => {
    const rows = evaluateRecommendationRules({
      ...baseArgs,
      signals: [],
      competitors: [],
      parity: [
        {
          target_date: '2026-05-22',
          our_rate: 220,
          channel_rate: 290,
          gap_pct: -24,
          source_count: 4,
        },
      ],
      compression: [],
    })
    const real = rows.find((r) => r.recommendation_key === 'real_parity_gap:2026-05-22')
    assert.ok(real)
    assert.equal(real?.priority, 5)
    assert.equal(real?.confidence, 'high')
  })

  it('ignores trivial parity gaps under 8%', () => {
    const rows = evaluateRecommendationRules({
      ...baseArgs,
      signals: [],
      competitors: [],
      parity: [
        {
          target_date: '2026-05-22',
          our_rate: 280,
          channel_rate: 300,
          gap_pct: -6.7,
          source_count: 4,
        },
      ],
      compression: [],
    })
    assert.equal(
      rows.find((r) => r.recommendation_key === 'real_parity_gap:2026-05-22'),
      undefined,
    )
  })

  it('emits a priority-5 compression alert when ≥60% of competitors are limited/sold_out', () => {
    const rows = evaluateRecommendationRules({
      ...baseArgs,
      signals: [],
      competitors: [],
      parity: [],
      compression: [{ target_date: '2026-05-23', limited_count: 4, competitor_count: 5 }],
    })
    const compression = rows.find((r) => r.recommendation_key === 'compression:2026-05-23')
    assert.ok(compression)
    assert.equal(compression?.priority, 5)
    assert.equal(compression?.confidence, 'high')
  })

  it('skips compression alerts with fewer than 3 competitor signals', () => {
    const rows = evaluateRecommendationRules({
      ...baseArgs,
      signals: [],
      competitors: [],
      parity: [],
      compression: [{ target_date: '2026-05-23', limited_count: 2, competitor_count: 2 }],
    })
    assert.equal(
      rows.find((r) => r.recommendation_key.startsWith('compression:')),
      undefined,
    )
  })

  it('suppresses the heuristic visibility_check when real parity data exists', () => {
    const rows = evaluateRecommendationRules({
      ...baseArgs,
      signals: [],
      competitors: [],
      parity: [
        {
          target_date: '2026-05-22',
          our_rate: 220,
          channel_rate: 290,
          gap_pct: -24,
          source_count: 4,
        },
      ],
      compression: [],
    })
    assert.equal(rows.find((r) => r.recommendation_key === 'visibility_check'), undefined)
  })

  it('emits the visibility_check fallback when no real parity exists', () => {
    const rows = evaluateRecommendationRules({
      ...baseArgs,
      signals: [],
      competitors: [],
      parity: [],
      compression: [],
    })
    assert.ok(rows.find((r) => r.recommendation_key === 'visibility_check'))
  })
})
