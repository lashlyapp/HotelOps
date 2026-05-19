import 'server-only'
import type {
  MarketSegment,
  Property,
  PropertyMarketProfile,
} from '@/lib/supabase/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { seededRandom } from './random'

// Auto-detect a property's market profile from the data already on the
// `properties` row. The strategic premise is that the GM should never
// have to fill out a "what's your segment" form before they see value
// — the platform infers it.
//
// Inference signals (v1, no third-party calls):
//
//   - Property `name` and `description` text → keywords for tier and
//     segment (e.g. "boutique", "lodge", "resort", "luxury").
//   - Address `city` → location descriptor.
//   - Deterministic ADR band keyed off (segment, city). Same property
//     gets the same band every time, so the UX is stable without
//     persisting noise.
//
// The result is upserted into `property_market_profile`. If the row
// already exists and `operator_confirmed` is true, we treat the
// existing values as ground truth and only fill in fields the GM
// left blank.

const LUXURY_KEYWORDS = [
  'luxury',
  'grand',
  'palace',
  'ritz',
  'four seasons',
  'estate',
  'château',
]
const BOUTIQUE_KEYWORDS = [
  'boutique',
  'house',
  'inn',
  'hotel',
  'lodge',
  'collection',
  'residences',
]
const LIFESTYLE_KEYWORDS = [
  'lifestyle',
  'social',
  'studio',
  'loft',
  'urban',
  'rooftop',
]
const RESORT_KEYWORDS = ['resort', 'spa', 'beach', 'island', 'coast']

const DOWNTOWN_CITIES = new Set([
  'New York',
  'San Francisco',
  'Chicago',
  'Los Angeles',
  'Miami',
  'Boston',
  'Seattle',
  'Austin',
  'Nashville',
  'Portland',
])

function inferSegment(text: string): MarketSegment {
  const t = text.toLowerCase()
  if (LUXURY_KEYWORDS.some((k) => t.includes(k))) return 'luxury'
  if (LIFESTYLE_KEYWORDS.some((k) => t.includes(k))) return 'lifestyle'
  if (RESORT_KEYWORDS.some((k) => t.includes(k))) return 'upscale'
  if (BOUTIQUE_KEYWORDS.some((k) => t.includes(k))) return 'boutique'
  return 'boutique'
}

function inferTier(segment: MarketSegment): number {
  switch (segment) {
    case 'luxury':
      return 5
    case 'upscale':
    case 'lifestyle':
      return 4
    case 'boutique':
      return 4
    case 'midscale':
      return 3
    case 'economy':
      return 2
  }
}

function inferAdrBand(
  segment: MarketSegment,
  property: Property,
): { floor: number; ceiling: number } {
  // Anchored band per segment, jittered deterministically by property id
  // so two boutique hotels don't show the same numbers. Same property
  // → same band, so the UX is stable across refreshes.
  const anchors: Record<MarketSegment, [number, number]> = {
    economy: [89, 149],
    midscale: [129, 189],
    upscale: [179, 269],
    lifestyle: [219, 329],
    boutique: [229, 349],
    luxury: [389, 599],
  }
  const [base, ceiling] = anchors[segment]
  const downtownLift = property.city && DOWNTOWN_CITIES.has(property.city) ? 1.18 : 1.0
  const rng = seededRandom(`adr:${property.id}`)
  const jitter = 0.92 + rng() * 0.18
  return {
    floor: Math.round(base * downtownLift * jitter),
    ceiling: Math.round(ceiling * downtownLift * jitter),
  }
}

function inferLocationDescriptor(property: Property): string | null {
  if (!property.city) return null
  if (DOWNTOWN_CITIES.has(property.city)) return `Downtown ${property.city}`
  if (property.state) return `${property.city}, ${property.state}`
  return property.city
}

function inferAmenityTags(text: string): string {
  const t = text.toLowerCase()
  const tags: string[] = []
  if (t.includes('rooftop')) tags.push('rooftop_bar')
  if (t.includes('spa')) tags.push('spa')
  if (t.includes('pool')) tags.push('pool')
  if (t.includes('restaurant') || t.includes('dining')) tags.push('restaurant')
  if (t.includes('beach') || t.includes('waterfront')) tags.push('waterfront')
  if (t.includes('historic')) tags.push('historic')
  if (tags.length === 0) tags.push('boutique_lifestyle')
  return tags.join(',')
}

export async function detectAndStoreMarketProfile(
  property: Property,
): Promise<PropertyMarketProfile> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('property_market_profile')
    .select('*')
    .eq('property_id', property.id)
    .maybeSingle<PropertyMarketProfile>()

  // If the operator confirmed the profile, respect every non-null field
  // and only fill the gaps. Otherwise re-derive everything from scratch.
  const surface = `${property.name} ${property.description ?? ''}`
  const segment = existing?.operator_confirmed && existing.market_segment
    ? existing.market_segment
    : inferSegment(surface)
  const tier = existing?.operator_confirmed && existing.tier
    ? existing.tier
    : inferTier(segment)
  const band = inferAdrBand(segment, property)
  const adr_floor = existing?.operator_confirmed && existing.adr_floor != null
    ? existing.adr_floor
    : band.floor
  const adr_ceiling = existing?.operator_confirmed && existing.adr_ceiling != null
    ? existing.adr_ceiling
    : band.ceiling
  const location_descriptor = existing?.operator_confirmed && existing.location_descriptor
    ? existing.location_descriptor
    : inferLocationDescriptor(property)
  const amenity_tags = existing?.operator_confirmed && existing.amenity_tags
    ? existing.amenity_tags
    : inferAmenityTags(surface)

  const next: Omit<PropertyMarketProfile, 'detected_at'> & { updated_at: string } = {
    property_id: property.id,
    org_id: property.org_id,
    market_segment: segment,
    tier,
    adr_floor,
    adr_ceiling,
    location_descriptor,
    amenity_tags,
    operator_confirmed: existing?.operator_confirmed ?? false,
    updated_at: new Date().toISOString(),
  }

  const { data: upserted, error } = await admin
    .from('property_market_profile')
    .upsert(
      { ...next, detected_at: existing?.detected_at ?? new Date().toISOString() },
      { onConflict: 'property_id' },
    )
    .select('*')
    .single<PropertyMarketProfile>()
  if (error || !upserted) {
    throw new Error(`detectAndStoreMarketProfile: ${error?.message ?? 'no row'}`)
  }
  return upserted
}
