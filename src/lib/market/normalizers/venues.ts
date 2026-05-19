import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Normalize external_observations(target_kind='venue') into two
// downstream tables:
//
//   • venues_catalog              — for non-hotel venues (used by
//                                   events to anchor a location)
//   • property_competitor_set     — for OSM hotel rows, scoped to
//                                   the property whose Overpass query
//                                   discovered them (property_id is
//                                   carried on the observation row)
//
// Real competitor discovery — replaces the synthetic name generator
// in src/lib/market/competitors.ts.

export async function normalizeVenues(options: { since?: string } = {}): Promise<{
  venues: number
  competitors: number
}> {
  const admin = createAdminClient()
  const since = options.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('external_observations')
    .select('source, target_key, geo_key, property_id, org_id, payload, observed_at')
    .eq('target_kind', 'venue')
    .gte('cleansed_at', since)
    .limit(10000)
  if (error) throw new Error(`normalizeVenues read: ${error.message}`)

  type VenueRow = {
    external_source: string
    external_id: string
    name: string
    kind: string
    capacity: number | null
    latitude: number | null
    longitude: number | null
    city_key: string | null
  }
  type CompetitorRow = {
    property_id: string
    org_id: string
    name: string
    archetype: string
    distance_km: number | null
    adr_floor: number | null
    adr_ceiling: number | null
    match_score: number
  }
  const venueRows: VenueRow[] = []
  // Per-property competitor stage map: we want the top-N closest
  // hotels per property, so we collect candidates then trim.
  const competitorCandidates = new Map<string, CompetitorRow[]>()

  for (const row of (data as Array<{
    source: string
    target_key: string | null
    geo_key: string | null
    property_id: string | null
    org_id: string | null
    payload: Record<string, unknown>
    observed_at: string
  }> | null) ?? []) {
    const p = row.payload
    const external_source = typeof p.external_source === 'string' ? p.external_source : row.source
    const external_id = typeof p.external_id === 'string' ? p.external_id : row.target_key ?? ''
    const name = typeof p.name === 'string' ? p.name : null
    const kind = typeof p.kind === 'string' ? p.kind : 'other'
    if (!name || !external_id) continue

    if (kind === 'hotel') {
      if (!row.property_id || !row.org_id) continue
      const distance_km = typeof p.distance_km === 'number' ? p.distance_km : null
      const candidate: CompetitorRow = {
        property_id: row.property_id,
        org_id: row.org_id,
        name,
        archetype: archetypeFor(p),
        distance_km,
        // OSM doesn't carry rate info. The OTA-affiliate adapters
        // populate adr_floor/ceiling on a separate path (PR4).
        adr_floor: null,
        adr_ceiling: null,
        // Match score decreases with distance. Tweak as needed.
        match_score: scoreFromDistance(distance_km),
      }
      const list = competitorCandidates.get(row.property_id) ?? []
      list.push(candidate)
      competitorCandidates.set(row.property_id, list)
    } else {
      venueRows.push({
        external_source,
        external_id,
        name,
        kind,
        capacity: typeof p.capacity === 'number' ? p.capacity : null,
        latitude: typeof p.latitude === 'number' ? p.latitude : null,
        longitude: typeof p.longitude === 'number' ? p.longitude : null,
        city_key: typeof p.city_key === 'string' ? p.city_key : null,
      })
    }
  }

  // Persist venues.
  let venuesWritten = 0
  if (venueRows.length > 0) {
    const { error: vErr, count } = await admin
      .from('venues_catalog')
      .upsert(venueRows, {
        onConflict: 'external_source,external_id',
        ignoreDuplicates: false,
        count: 'exact',
      })
    if (vErr) throw new Error(`normalizeVenues venues write: ${vErr.message}`)
    venuesWritten = count ?? venueRows.length
  }

  // Persist competitors per property — top 8 by match_score.
  let competitorsWritten = 0
  for (const [property_id, candidates] of competitorCandidates) {
    candidates.sort((a, b) => b.match_score - a.match_score)
    const top = candidates.slice(0, 8)
    // Dedupe on (property_id, name) at the application layer because
    // OSM occasionally surfaces the same hotel twice (node + way).
    const seen = new Set<string>()
    const dedup: CompetitorRow[] = []
    for (const c of top) {
      const key = `${property_id}::${normalize(c.name)}`
      if (seen.has(key)) continue
      seen.add(key)
      dedup.push(c)
    }
    if (dedup.length === 0) continue
    // Upsert maps directly to property_competitor_set's unique
    // constraint (property_id, name = competitor_name in v1 schema).
    const rows = dedup.map((c) => ({
      property_id: c.property_id,
      org_id: c.org_id,
      competitor_name: c.name,
      archetype: c.archetype,
      distance_km: c.distance_km,
      adr_floor: c.adr_floor,
      adr_ceiling: c.adr_ceiling,
      match_score: c.match_score,
      external_source: 'osm',
      external_id: null,
    }))
    const { error: cErr } = await admin
      .from('property_competitor_set')
      .upsert(rows, {
        onConflict: 'property_id,competitor_name',
        ignoreDuplicates: false,
      })
    if (cErr) {
      // Fall back to per-row insert ignoring duplicates so one bad
      // row doesn't kill the whole batch.
      for (const r of rows) {
        const { error: e } = await admin.from('property_competitor_set').insert(r)
        if (!e) competitorsWritten++
      }
    } else {
      competitorsWritten += rows.length
    }
  }

  return { venues: venuesWritten, competitors: competitorsWritten }
}

function archetypeFor(p: Record<string, unknown>): string {
  const stars = typeof p.stars === 'number' ? p.stars : null
  if (stars != null && stars >= 5) return 'lifestyle_peer'
  if (stars != null && stars >= 4) return 'similar_boutique'
  if (stars != null && stars <= 2) return 'independent_peer'
  return 'similar_boutique'
}

function scoreFromDistance(km: number | null): number {
  if (km == null) return 70
  if (km <= 0.5) return 96
  if (km <= 1) return 92
  if (km <= 2) return 86
  if (km <= 3) return 78
  if (km <= 4) return 72
  return 65
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '')
}
