'use server'

import { revalidatePath } from 'next/cache'
import { denyIfRestricted, requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { refreshMarketIntelligence } from '@/lib/market/refresh'
import type {
  MarketSegment,
  Property,
  PropertyMarketProfile,
} from '@/lib/supabase/types'

export type ActionResult = { error?: string; success?: string }

const SEGMENTS: MarketSegment[] = [
  'economy',
  'midscale',
  'upscale',
  'luxury',
  'lifestyle',
  'boutique',
]

function trim(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function trimOrNull(value: FormDataEntryValue | null): string | null {
  const v = trim(value)
  return v === '' ? null : v
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  const v = trim(value)
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function loadPropertyInOrg(
  orgId: string,
  propertyId: string,
): Promise<Property | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .eq('org_id', orgId)
    .maybeSingle<Property>()
  return data
}

// ---------------------------------------------------------------------------
// Force a re-derivation of today's market intelligence. The page calls this
// in two scenarios: first visit of the day (nothing exists), and on the
// explicit "Refresh insights" button. Idempotent.
// ---------------------------------------------------------------------------
export async function refreshMarketAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  const blocked = denyIfRestricted(session)
  if (blocked) return blocked

  const propertyId = trim(formData.get('property_id'))
  if (!propertyId) return { error: 'Missing property.' }
  const property = await loadPropertyInOrg(session.organization.id, propertyId)
  if (!property) return { error: 'Property not found.' }

  try {
    await refreshMarketIntelligence(property, session.organization)
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Unable to refresh insights.',
    }
  }

  revalidatePath('/market')
  return { success: 'Insights refreshed.' }
}

// ---------------------------------------------------------------------------
// Save operator overrides to the auto-detected market profile. Setting
// any field here flips operator_confirmed = true, after which the
// auto-detector treats existing values as ground truth.
// ---------------------------------------------------------------------------
export async function saveMarketProfileAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  const blocked = denyIfRestricted(session)
  if (blocked) return blocked

  const propertyId = trim(formData.get('property_id'))
  if (!propertyId) return { error: 'Missing property.' }
  const property = await loadPropertyInOrg(session.organization.id, propertyId)
  if (!property) return { error: 'Property not found.' }

  const segment = trim(formData.get('market_segment')) as MarketSegment
  if (!SEGMENTS.includes(segment)) return { error: 'Pick a market segment.' }

  const tierRaw = numberOrNull(formData.get('tier'))
  if (tierRaw == null || tierRaw < 1 || tierRaw > 5) {
    return { error: 'Tier must be 1–5.' }
  }
  const adrFloor = numberOrNull(formData.get('adr_floor'))
  const adrCeiling = numberOrNull(formData.get('adr_ceiling'))
  if (adrFloor != null && adrCeiling != null && adrFloor > adrCeiling) {
    return { error: 'ADR floor cannot exceed the ceiling.' }
  }
  const location = trimOrNull(formData.get('location_descriptor'))
  const amenityTags = trimOrNull(formData.get('amenity_tags'))
  const tripadvisorUrl = trimOrNull(formData.get('tripadvisor_url'))
  if (tripadvisorUrl && !/^https?:\/\/(www\.)?tripadvisor\./i.test(tripadvisorUrl)) {
    return { error: 'TripAdvisor URL must point to tripadvisor.com (or a regional .co.uk / .ca etc).' }
  }

  const update: Partial<PropertyMarketProfile> & {
    property_id: string
    org_id: string
  } = {
    property_id: propertyId,
    org_id: session.organization.id,
    market_segment: segment,
    tier: Math.round(tierRaw),
    adr_floor: adrFloor,
    adr_ceiling: adrCeiling,
    location_descriptor: location,
    amenity_tags: amenityTags,
    tripadvisor_url: tripadvisorUrl,
    operator_confirmed: true,
    updated_at: new Date().toISOString(),
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('property_market_profile')
    .upsert(update, { onConflict: 'property_id' })
  if (error) return { error: error.message }

  // Re-derive everything downstream so the briefing reflects the
  // new positioning immediately.
  try {
    await refreshMarketIntelligence(property, session.organization)
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Saved, but refresh failed. Try again from /market.',
    }
  }

  revalidatePath('/market')
  revalidatePath('/market/settings')
  return { success: 'Market profile saved.' }
}

// ---------------------------------------------------------------------------
// Mark a recommendation as acted on so it stops appearing in the
// "active opportunities" list.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Toggle org-level Revenue Intelligence preferences:
//   • peer_adr_opt_in — contribute anonymized ADR band to the city pool
//   • market_briefing_email_opt_out — silence the daily 6am digest
// Only org_owners can change these.
// ---------------------------------------------------------------------------
export async function saveMarketPreferencesAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  const blocked = denyIfRestricted(session)
  if (blocked) return blocked
  if (session.profile.role !== 'org_owner') {
    return { error: 'Only the org owner can change market preferences.' }
  }

  const peerOptIn = String(formData.get('peer_adr_opt_in') ?? '') === 'on'
  const emailOptOut = String(formData.get('market_briefing_email_opt_out') ?? '') === 'on'

  const admin = createAdminClient()
  const { error } = await admin
    .from('organizations')
    .update({
      peer_adr_opt_in: peerOptIn,
      market_briefing_email_opt_out: emailOptOut,
    })
    .eq('id', session.organization.id)
  if (error) return { error: error.message }

  revalidatePath('/market/settings')
  return { success: 'Preferences saved.' }
}

export async function actOnRecommendationAction(
  formData: FormData,
): Promise<void> {
  const session = await requireOrgUser({ write: true })
  if (denyIfRestricted(session)) return

  const recommendationId = trim(formData.get('recommendation_id'))
  if (!recommendationId) return

  const admin = createAdminClient()
  // RLS would prevent cross-org writes, but service-role bypasses RLS;
  // scope explicitly to the org.
  await admin
    .from('pricing_recommendations')
    .update({ acted_at: new Date().toISOString() })
    .eq('id', recommendationId)
    .eq('org_id', session.organization.id)

  revalidatePath('/market')
}
