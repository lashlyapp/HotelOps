import { NextResponse, type NextRequest } from 'next/server'
import { reconcileStorageForProperty } from '@/lib/storage/reconcile'
import { refreshStorageForProperty } from '@/lib/storage/usage'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Vercel Cron: nightly storage-usage sweep. For each property:
 *
 *   1. List every R2 object under the property prefix, sum bytes
 *      (sumStorageBytes), stamp the total to
 *      properties.storage_used_bytes + storage_used_at.
 *   2. Compare the fresh total against the property's quota and
 *      reconcile the storage-overage SubscriptionItem quantity in
 *      Stripe (reconcileStorageForProperty).
 *
 * Storage usage drifts continuously — every upload bumps it, every
 * delete trims it — but billing only needs to be right at invoice
 * close. Daily is more than precise enough for that.
 *
 * Schedule lives in `vercel.json`. Auth uses
 * `Authorization: Bearer ${CRON_SECRET}`.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not set' },
      { status: 500 },
    )
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 },
    )
  }

  const admin = createAdminClient()
  const { data: properties, error } = await admin
    .from('properties')
    .select('id, r2_prefix')
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    )
  }

  const failures: Array<{ propertyId: string; message: string }> = []
  let scanned = 0
  for (const property of properties ?? []) {
    try {
      const usedBytes = await refreshStorageForProperty({
        propertyId: property.id,
        r2Prefix: property.r2_prefix,
      })
      await reconcileStorageForProperty({
        propertyId: property.id,
        usedBytes,
      })
      scanned += 1
    } catch (err) {
      failures.push({
        propertyId: property.id,
        message: err instanceof Error ? err.message : 'unknown',
      })
    }
  }

  return NextResponse.json({ ok: true, scanned, failures })
}
