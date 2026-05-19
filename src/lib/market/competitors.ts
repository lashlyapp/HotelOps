import 'server-only'
import type {
  CompetitorArchetype,
  Property,
  PropertyCompetitor,
  PropertyMarketProfile,
} from '@/lib/supabase/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { seededRandom } from './random'

// Auto-derive a comparable-property set per the strategic philosophy:
// the GM should never have to type "configure my comp set". v1 uses
// heuristic archetype names anchored on the property's segment +
// location so the cards feel concrete. The shape forward-supports a
// later backfill from a real source (Booking.com, Lighthouse import)
// via external_source / external_id columns.

const NAME_PREFIXES = [
  'The',
  'Hotel',
  'Maison',
  'Casa',
  'Villa',
  'House of',
  'La',
  'Atelier',
]
const NAME_ROOTS = [
  'Aurora',
  'Marlowe',
  'Halcyon',
  'Sable',
  'Verena',
  'Bellamy',
  'Wren',
  'Larkspur',
  'Ember',
  'Cresswell',
  'Larchmont',
  'Pemberton',
  'Sterling',
  'Marquis',
  'Brixton',
]
const NAME_SUFFIXES = [
  '',
  'Collection',
  'House',
  'Residences',
  'Lofts',
  'Boutique',
  'Lifestyle',
]

function generateName(seed: string): string {
  const rng = seededRandom(`name:${seed}`)
  const prefix = NAME_PREFIXES[Math.floor(rng() * NAME_PREFIXES.length)]
  const root = NAME_ROOTS[Math.floor(rng() * NAME_ROOTS.length)]
  const suffix = NAME_SUFFIXES[Math.floor(rng() * NAME_SUFFIXES.length)]
  return [prefix, root, suffix].filter(Boolean).join(' ')
}

function archetypesForSegment(
  segment: PropertyMarketProfile['market_segment'],
): CompetitorArchetype[] {
  switch (segment) {
    case 'luxury':
      return ['similar_boutique', 'upscale_chain', 'lifestyle_peer', 'independent_peer']
    case 'lifestyle':
      return ['lifestyle_peer', 'similar_boutique', 'independent_peer', 'upscale_chain']
    case 'boutique':
      return ['similar_boutique', 'independent_peer', 'lifestyle_peer', 'upscale_chain']
    case 'upscale':
      return ['upscale_chain', 'similar_boutique', 'lifestyle_peer', 'independent_peer']
    default:
      return ['similar_boutique', 'independent_peer', 'lifestyle_peer', 'upscale_chain']
  }
}

export async function detectAndStoreCompetitors(
  property: Property,
  profile: PropertyMarketProfile,
  count = 5,
): Promise<PropertyCompetitor[]> {
  const admin = createAdminClient()

  // If the property already has a non-empty competitor set, we keep
  // the existing rows (so re-running the refresher doesn't churn the
  // UI) and only top up to `count`.
  const { data: existing } = await admin
    .from('property_competitor_set')
    .select('*')
    .eq('property_id', property.id)
    .order('match_score', { ascending: false })
  const existingRows = (existing as PropertyCompetitor[] | null) ?? []
  if (existingRows.length >= count) return existingRows.slice(0, count)

  const archetypes = archetypesForSegment(profile.market_segment)
  const newRows: Array<
    Omit<PropertyCompetitor, 'id' | 'created_at'> & { id?: string }
  > = []
  const taken = new Set(existingRows.map((r) => r.competitor_name))
  let seedSalt = existingRows.length
  for (let i = existingRows.length; i < count; i++) {
    const archetype = archetypes[i % archetypes.length]
    // Try a few seeds in case of name collision with what's already stored.
    let name = ''
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateName(`${property.id}:${i}:${seedSalt + attempt}`)
      if (!taken.has(candidate)) {
        name = candidate
        break
      }
    }
    if (!name) continue
    taken.add(name)
    seedSalt++

    const rng = seededRandom(`comp:${property.id}:${i}`)
    const distance_km = Number((0.4 + rng() * 3.8).toFixed(2))
    const floorBase = profile.adr_floor ?? 199
    const ceilingBase = profile.adr_ceiling ?? 299
    const floorJitter = 0.92 + rng() * 0.16
    const ceilingJitter = 0.96 + rng() * 0.14
    const adr_floor = Math.round(floorBase * floorJitter)
    const adr_ceiling = Math.round(ceilingBase * ceilingJitter)
    const match_score = 95 - i * 5 - Math.floor(rng() * 6)

    newRows.push({
      property_id: property.id,
      org_id: property.org_id,
      competitor_name: name,
      archetype,
      distance_km,
      adr_floor,
      adr_ceiling,
      match_score,
      external_source: null,
      external_id: null,
    })
  }

  if (newRows.length === 0) return existingRows

  const { data: inserted, error } = await admin
    .from('property_competitor_set')
    .insert(newRows)
    .select('*')
  if (error) throw new Error(`detectAndStoreCompetitors: ${error.message}`)

  const combined = [
    ...existingRows,
    ...((inserted as PropertyCompetitor[] | null) ?? []),
  ]
  combined.sort((a, b) => b.match_score - a.match_score)
  return combined.slice(0, count)
}
