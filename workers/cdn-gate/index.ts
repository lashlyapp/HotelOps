/**
 * cdn.myhotelops.com gate worker
 *
 * Sits in front of the R2 bucket. For every media request:
 *   1. Extract org slug from the first path segment (we lay R2 keys out as
 *      `<org-slug>/<property-slug>/...`).
 *   2. Look up `gate:<org-slug>` in KV. If the value is "1" the org's
 *      subscription is past_due ≥ 15 days / paused / canceled — return 403.
 *      The app-side updater (lib/billing/cdn-gate.ts) writes/deletes this
 *      key when sub status changes; KV propagates globally in <60s.
 *   3. Otherwise serve the object from R2 with a short cache TTL so a state
 *      change after a hit doesn't keep serving cached content for too long.
 *
 * Failure mode: if KV is unreachable / org has no entry, fail OPEN. The
 * gate is for billing leverage, not security; serving a non-paying customer
 * for an extra minute is much better than 403'ing every paying customer
 * during a Cloudflare KV incident.
 */

export interface Env {
  MEDIA: R2Bucket
  GATE: KVNamespace
}

const CACHE_TTL_SECONDS = 3600 // 1hr — bounds worst-case lock-application time

const handler = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      })
    }

    const url = new URL(request.url)
    const path = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    if (!path) {
      return new Response('Not found', { status: 404 })
    }
    const orgSlug = path.split('/', 1)[0]
    if (!orgSlug) {
      return new Response('Not found', { status: 404 })
    }

    // Gate check. KV reads are edge-cached; the warm-path is sub-millisecond.
    let locked: string | null = null
    try {
      locked = await env.GATE.get(`gate:${orgSlug}`)
    } catch (err) {
      console.warn('cdn-gate: KV read failed', err)
      // fail open — see top-of-file note
    }
    if (locked === '1') {
      return new Response(
        'This account has been suspended for non-payment. Contact the hotel directly.',
        {
          status: 403,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        },
      )
    }

    // Prefer Cloudflare's edge cache when warm.
    const cacheKey = new Request(url.toString(), request)
    const cache = (caches as unknown as { default: Cache }).default
    const cached = await cache.match(cacheKey)
    if (cached) return cached

    const obj = await env.MEDIA.get(path, {
      onlyIf: request.headers,
      range: request.headers,
    })
    if (!obj) {
      return new Response('Not found', { status: 404 })
    }

    const headers = new Headers()
    obj.writeHttpMetadata(headers)
    headers.set('etag', obj.httpEtag)
    headers.set('cache-control', `public, max-age=${CACHE_TTL_SECONDS}`)
    // Per-org cache tag; lets us purge by tag when an org's gate flips
    // (Enterprise plans only — on lower tiers we rely on CACHE_TTL_SECONDS).
    headers.set('cache-tag', `org:${orgSlug}`)

    // R2 returns an R2ObjectBody for full reads, R2Object for HEAD/range
    // misses; both share writeHttpMetadata.
    const body = 'body' in obj ? obj.body : null
    const status =
      'body' in obj ? 200 : request.method === 'HEAD' ? 200 : 304

    const response = new Response(body, { status, headers })
    if (status === 200 && request.method === 'GET') {
      ctx.waitUntil(cache.put(cacheKey, response.clone()))
    }
    return response
  },
}

export default handler
