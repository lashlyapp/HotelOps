import 'server-only'
import { STORAGE_HARD_CAP_BYTES, computeStorageBlocks } from './usage'

/**
 * Shared upload-time storage gate. Called from every presign action so
 * each module enforces the same caps:
 *
 *   { ok: true }                          — upload fits in current block
 *   { ok: true, warning: ... }            — upload crosses into a new
 *                                            $5/25 GB block; UI shows a
 *                                            one-time confirmation
 *   { ok: false, error: ... }             — upload would exceed the
 *                                            500 GB hard ceiling
 *
 * The `property` shape lets callers pass either the session-cached
 * property row or a fresh lookup; we only need the two storage fields.
 */
export function checkStorageGuardrails(
  property: { storage_used_bytes: number; storage_quota_bytes: number },
  uploadBytes: number,
):
  | { ok: true; warning?: { kind: 'storage_block_added'; message: string } }
  | { ok: false; error: string } {
  const projectedBytes = property.storage_used_bytes + uploadBytes
  if (projectedBytes > STORAGE_HARD_CAP_BYTES) {
    return {
      ok: false,
      error:
        'This upload would exceed the 500 GB per-property storage ceiling. Email support@myhotelops.com to lift it on a custom plan.',
    }
  }
  const before = computeStorageBlocks({
    usedBytes: property.storage_used_bytes,
    quotaBytes: property.storage_quota_bytes,
  })
  const after = computeStorageBlocks({
    usedBytes: projectedBytes,
    quotaBytes: property.storage_quota_bytes,
  })
  if (after > before) {
    return {
      ok: true,
      warning: {
        kind: 'storage_block_added',
        message: `This upload puts you ${after === 1 ? 'over the 25 GB base quota' : `into block ${after}`}. Your next invoice will include +$5/mo per 25 GB block.`,
      },
    }
  }
  return { ok: true }
}
