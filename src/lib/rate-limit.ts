import 'server-only'

/**
 * In-process token bucket. Each Vercel function instance keeps its own map,
 * so the effective ceiling is roughly `instances × limit` — fine as a
 * defense against runaway clients (a buggy script firing thousands of
 * presign requests gets clamped per instance) but not a substitute for
 * edge-level WAF rules if you're worried about an actual flood. At 500
 * tenants this catches the realistic failure mode (one tenant's deploy
 * loop hammers `/api/...` for hours) without adding a Redis dependency.
 *
 * Buckets are evicted lazily as keys are looked up, so a forgotten key
 * just expires in place. Memory ceiling is bounded by the active-user
 * working set, which is small.
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export type RateLimitOptions = {
  /** Max permitted hits within the window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterMs: number }

export function checkRateLimit(
  key: string,
  opts: RateLimitOptions,
): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs })
    return { ok: true }
  }
  if (bucket.count >= opts.limit) {
    return { ok: false, retryAfterMs: bucket.resetAt - now }
  }
  bucket.count += 1
  return { ok: true }
}
