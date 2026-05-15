import 'server-only'
import { ListObjectsV2Command, type _Object } from '@aws-sdk/client-s3'
import { r2Bucket, r2Client } from '@/lib/r2/client'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Storage quota constants. See docs/pricing.md for the customer-facing
 * presentation; these are the numerical truth.
 *
 *   STORAGE_BLOCK_BYTES   — one billing block = 25 GB
 *   STORAGE_HARD_CAP_GB   — refuse uploads beyond this. Anti-abuse +
 *                            cost ceiling. Anyone hitting it should be
 *                            talking to us about a custom plan.
 */
export const STORAGE_BLOCK_BYTES = 25 * 1024 ** 3 // 25 GB
export const STORAGE_HARD_CAP_BYTES = 500 * 1024 ** 3 // 500 GB

// Refresh cadence for cached storage_used_bytes. The cron writes every
// 24h; ad-hoc reads use the cached value if newer than this, otherwise
// recompute on the fly. Tuned so a stale tab can't underestimate usage
// by more than half a day.
export const STORAGE_STALE_MS = 12 * 60 * 60 * 1000

/**
 * How many overage blocks does this usage level imply?
 *
 *   0 GB                  → 0 blocks
 *   25 GB (== quota)      → 0 blocks
 *   25.5 GB               → 1 block
 *   50 GB                 → 1 block
 *   50.000001 GB          → 2 blocks
 *
 * Pure function — exported so the billing reconciler, the cron, and the
 * UI all agree on the same math without round-trips to a service.
 */
export function computeStorageBlocks(args: {
  usedBytes: number
  quotaBytes: number
  blockBytes?: number
}): number {
  const block = args.blockBytes ?? STORAGE_BLOCK_BYTES
  const over = args.usedBytes - args.quotaBytes
  if (over <= 0) return 0
  return Math.ceil(over / block)
}

/**
 * Sum every object byte under a property's R2 prefix. Includes the
 * `_meta/`, `_posters/`, `_it-docs/`, `_work-orders/` internal
 * subprefixes — they're all stored under the tenant's namespace and
 * count toward the quota. The /media listing has its own visibility
 * filter for those subprefixes; this isn't that.
 */
export async function sumStorageBytes(prefix: string): Promise<number> {
  const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`
  const client = r2Client()
  const bucket = r2Bucket()
  let continuationToken: string | undefined
  let total = 0
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: normalized,
        ContinuationToken: continuationToken,
      }),
    )
    for (const obj of (res.Contents ?? []) as _Object[]) {
      if (!obj.Key) continue
      // Skip directory placeholder objects (size 0, key ends with /).
      if (obj.Key.endsWith('/')) continue
      total += obj.Size ?? 0
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)
  return total
}

/**
 * Recompute storage for a single property and stamp the result back to
 * the row. Returns the fresh byte total so callers can act immediately
 * (e.g. the reconciler decides how many blocks to bill).
 *
 * Idempotent. Concurrent runs converge — last writer wins, and the
 * value lags reality by at most one cron interval anyway.
 */
export async function refreshStorageForProperty(args: {
  propertyId: string
  r2Prefix: string
}): Promise<number> {
  const total = await sumStorageBytes(args.r2Prefix)
  const admin = createAdminClient()
  const { error } = await admin
    .from('properties')
    .update({
      storage_used_bytes: total,
      storage_used_at: new Date().toISOString(),
    })
    .eq('id', args.propertyId)
  if (error) throw error
  return total
}

/**
 * Read the cached storage usage from the DB. Used by the billing UI
 * (cheap, no R2 round-trip). The caller can decide whether the
 * `storage_used_at` timestamp is fresh enough for their purpose; the
 * upload pre-check, for example, falls back to refreshStorageForProperty
 * if the cache is older than STORAGE_STALE_MS.
 */
export async function readStorageForProperty(propertyId: string): Promise<{
  usedBytes: number
  quotaBytes: number
  usedAt: string | null
} | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('properties')
    .select('storage_used_bytes, storage_quota_bytes, storage_used_at')
    .eq('id', propertyId)
    .maybeSingle()
  if (!data) return null
  return {
    usedBytes: data.storage_used_bytes ?? 0,
    quotaBytes: data.storage_quota_bytes ?? STORAGE_BLOCK_BYTES,
    usedAt: data.storage_used_at,
  }
}

/**
 * Format a byte count for display. Threshold-based so 26.7 GB and
 * 250 KB both read naturally.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}
