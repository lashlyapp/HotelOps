import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Generate the next per-property task reference like "TSK-0042".
 *
 * Race-tolerant enough for v1 — collisions hit the unique constraint
 * `(property_id, reference)` and the caller retries once. Mirrors the
 * same pattern used by `events.reference`.
 */
export async function nextTaskReference(propertyId: string): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tasks')
    .select('reference')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
    .limit(1)
  const last = data?.[0]?.reference ?? ''
  const m = last.match(/^TSK-(\d+)$/)
  const n = m ? Number.parseInt(m[1], 10) + 1 : 1
  return `TSK-${String(n).padStart(4, '0')}`
}
