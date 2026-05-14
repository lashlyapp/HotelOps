import 'server-only'
import type { OrgSession } from '@/lib/auth/session'
import { denyIfRestricted } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ArrivalPage, Property } from '@/lib/supabase/types'

/**
 * Look up the property's arrival page row, creating it on first visit so
 * the operator doesn't need a separate "Create" click. Plain server
 * function (no `'use server'`) — the server component renderer calls
 * this inline, where a `'use server'` action would force a POST-style
 * callable and complicate exception flow.
 *
 * Returns `null` for properties the caller's session can't write to
 * (gated billing); the page surfaces a friendly notice in that case.
 */
export async function ensureArrivalPage(
  session: OrgSession,
  property: Property,
): Promise<
  | { ok: true; page: ArrivalPage }
  | { ok: false; error: string }
> {
  const denial = denyIfRestricted(session)
  if (denial) return { ok: false, error: denial.error }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('arrival_pages')
    .select('*')
    .eq('property_id', property.id)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (existing) return { ok: true, page: existing as ArrivalPage }

  const { data: inserted, error } = await admin
    .from('arrival_pages')
    .insert({
      org_id: session.organization.id,
      property_id: property.id,
      public_slug: property.slug,
    })
    .select('*')
    .single()
  if (error) {
    // Most likely cause is a unique-constraint collision on public_slug
    // because the property slug clashes with another arrival page in the
    // same Supabase project. Surface it instead of crashing the render.
    return { ok: false, error: humanizeError(error.message) }
  }
  return { ok: true, page: inserted as ArrivalPage }
}

function humanizeError(message: string): string {
  if (message.toLowerCase().includes('arrival_pages_public_slug_idx')) {
    return 'Another property already owns this slug. Open the page and pick a different one before continuing.'
  }
  return message
}
