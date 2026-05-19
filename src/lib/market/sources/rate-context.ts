import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Per-property competitor list + date window the OTA rate adapters
// need. Separated from the generic AdapterContext so each rate
// adapter can iterate properties → competitors and emit per-(comp,
// date) Observation rows.

export type RateCompetitor = {
  id: string
  property_id: string
  org_id: string
  name: string
  external_source: string | null
  external_id: string | null
  external_booking_id: string | null
  external_expedia_id: string | null
  external_hotelbeds_id: string | null
}

export type RateTarget = {
  property_id: string
  org_id: string
  currency: string
  competitors: RateCompetitor[]
  target_dates: string[] // YYYY-MM-DD, next 14 days
}

export async function buildRateTargets(options: { horizonDays?: number } = {}): Promise<RateTarget[]> {
  const horizon = options.horizonDays ?? 14
  const admin = createAdminClient()

  const { data: comps, error } = await admin
    .from('property_competitor_set')
    .select('id, property_id, org_id, competitor_name, external_source, external_id')
  if (error) throw new Error(`buildRateTargets: ${error.message}`)

  // Group competitors by property.
  const byProperty = new Map<string, RateCompetitor[]>()
  for (const row of (comps as Array<{
    id: string
    property_id: string
    org_id: string
    competitor_name: string
    external_source: string | null
    external_id: string | null
  }> | null) ?? []) {
    const list = byProperty.get(row.property_id) ?? []
    list.push({
      id: row.id,
      property_id: row.property_id,
      org_id: row.org_id,
      name: row.competitor_name,
      external_source: row.external_source,
      external_id: row.external_id,
      // v2: separate external ids per OTA. v1 uses external_id
      // generically.
      external_booking_id: row.external_source === 'booking_affiliate' ? row.external_id : null,
      external_expedia_id: row.external_source === 'expedia_rapid' ? row.external_id : null,
      external_hotelbeds_id: row.external_source === 'hotelbeds' ? row.external_id : null,
    })
    byProperty.set(row.property_id, list)
  }

  // Resolve org currency per property.
  const propertyIds = [...byProperty.keys()]
  if (propertyIds.length === 0) return []
  const { data: properties } = await admin
    .from('properties')
    .select('id, org_id, organizations(currency)')
    .in('id', propertyIds)

  const today = new Date()
  const target_dates: string[] = []
  for (let i = 1; i <= horizon; i++) {
    const d = new Date(today.getTime())
    d.setUTCDate(d.getUTCDate() + i)
    target_dates.push(d.toISOString().slice(0, 10))
  }

  const out: RateTarget[] = []
  for (const p of (properties as Array<{
    id: string
    org_id: string
    organizations: { currency: string } | { currency: string }[] | null
  }> | null) ?? []) {
    // Supabase returns the joined org as an array (1:N relation
    // syntax) or as an object depending on the FK. Handle both.
    const orgs = p.organizations
    const currency = Array.isArray(orgs) ? orgs[0]?.currency : orgs?.currency
    out.push({
      property_id: p.id,
      org_id: p.org_id,
      currency: (currency ?? 'usd').toUpperCase(),
      competitors: byProperty.get(p.id) ?? [],
      target_dates,
    })
  }
  return out
}

export function expiresInOneDay(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
}
