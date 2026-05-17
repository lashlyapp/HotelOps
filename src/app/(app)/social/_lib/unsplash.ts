import 'server-only'
import { unstable_cache } from 'next/cache'

// Unsplash API client. Free tier (5000 req/hour after approval, 50/hour
// in demo mode) is well within our envelope: one daily cron × N
// properties at most. Keyed off UNSPLASH_ACCESS_KEY (platform env var,
// not per-tenant) — when unset, every call returns null and the
// caller falls back to the property's media catalog.
//
// Attribution: Unsplash's license is free for commercial use without
// mandatory attribution in the END artifact, but the *Unsplash API
// guidelines* require us to (a) credit the photographer in our UI
// when we show their photo, and (b) trigger a "download" tracking
// hit when the photo is used. We do both — the UI renders a small
// "Photo by X on Unsplash" caption under the suggested image, and
// the cron pings the download_location URL the API returned at
// generation time.
//   https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines

const SEARCH_ENDPOINT = 'https://api.unsplash.com/search/photos'
const TIMEOUT_MS = 6000

export type UnsplashPhoto = {
  id: string
  // Full-size CDN URL suitable for direct <img src>. Unsplash also
  // returns smaller variants (regular, small) — we use "regular" since
  // it's the right size for both the in-app preview and a
  // social-platform post (~1080 wide, plenty for Instagram).
  url: string
  // Required by Unsplash to attribute the photographer. Rendered as
  // "Photo by {photographerName} on Unsplash" with both name and
  // "Unsplash" linked.
  photographerName: string
  photographerUrl: string
  // Link back to the photo's Unsplash page. Required as part of
  // attribution.
  unsplashPageUrl: string
  // Triggering this URL counts as a "download" per the API
  // guidelines. We fire it from the cron immediately after picking
  // a photo — even if the GM never publishes, the photo was "used"
  // (suggested) and counts toward the photographer's stats.
  trackDownloadUrl: string
  // Short alt text Unsplash supplies. May be null if the photographer
  // didn't write one; we render the topic label as a fallback.
  altDescription: string | null
}

export type UnsplashQuery = {
  // Free-form search string. Examples:
  //   "santa barbara landmark"
  //   "linen napkin espresso morning"
  //   "fog over pine forest"
  query: string
  // Used as part of the cache key + as a stable seed when picking
  // which of the top-N results to return, so the same (query,
  // seed) tuple yields the same photo when no exclusions are
  // passed. The cron passes the post date so retries within the
  // day are idempotent.
  seed: string
  // Unsplash photo ids to skip when picking — used by the dedupe
  // path that excludes photos the property used in the last 30
  // days. When set, results are NOT cached (the exclusion set is
  // per-property and would balloon the cache key); callers that
  // don't need dedupe should leave this undefined to get the cache
  // hit.
  excludePhotoIds?: string[]
}

/**
 * Search Unsplash for a relevant photo. Returns null when:
 *   - UNSPLASH_ACCESS_KEY is unset (free tier opt-in is platform-wide)
 *   - the query had no results
 *   - the upstream API failed (network, rate-limit, anything)
 * Caller treats all three the same way: fall back to the media catalog.
 *
 * Results are cached for 6 hours per (query, seed) tuple. The cron
 * runs once per property per day and only one Unsplash photo is
 * picked per generation, so the cache mostly absorbs same-city
 * properties sharing a query (a chain with three Paris hotels all
 * landing on the same "paris landmark" pick is fine — it's a
 * fixed-location photo, not personalized content).
 */
export async function pickUnsplashPhoto(
  input: UnsplashQuery,
): Promise<UnsplashPhoto | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim()
  if (!key) return null

  try {
    // When an exclusion list is passed, skip the cache: the
    // exclusion set is per-property and varies day-to-day, which
    // makes the cache key unstable. Direct call instead.
    if (input.excludePhotoIds && input.excludePhotoIds.length > 0) {
      return await searchUncached(key, input)
    }
    return await unstable_cache(
      () => searchUncached(key, input),
      ['unsplash-search', input.query, input.seed],
      { revalidate: 60 * 60 * 6 },
    )()
  } catch (err) {
    console.warn('[social] unsplash lookup failed', input.query, err)
    return null
  }
}

async function searchUncached(
  accessKey: string,
  input: UnsplashQuery,
): Promise<UnsplashPhoto | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const url = new URL(SEARCH_ENDPOINT)
    url.searchParams.set('query', input.query)
    // Landscape orientation reads better in Instagram/Facebook
    // previews and a hotel-vibe shot doesn't typically benefit from a
    // portrait crop. (TikTok's 9:16 frame letterboxes either way.)
    url.searchParams.set('orientation', 'landscape')
    // Pull the top 30 so the dedupe path has room to skip up to 30
    // recently-used photos and still find a fresh result. Without
    // exclusions we walk from the seed-derived index; with
    // exclusions we walk until we hit a non-excluded id.
    url.searchParams.set('per_page', '30')
    url.searchParams.set(
      'content_filter',
      // 'high' filters anything mature/violent. The hotel context
      // doesn't need anything stronger, and the default ('low') has
      // occasionally surfaced edgy results on travel queries.
      'high',
    )

    const res = await fetch(url, {
      headers: {
        'accept-version': 'v1',
        authorization: `Client-ID ${accessKey}`,
      },
      signal: controller.signal,
    })
    if (!res.ok) return null

    const json = (await res.json()) as {
      results?: Array<{
        id: string
        urls?: { regular?: string }
        user?: { name?: string; links?: { html?: string } }
        links?: { html?: string; download_location?: string }
        alt_description?: string | null
      }>
    }
    const list = json.results ?? []
    if (list.length === 0) return null

    // Walk the results starting at the seed-derived offset; skip
    // any photo whose id appears in excludePhotoIds. This is what
    // prevents the same Unsplash photo from showing up in a
    // property's feed twice within the dedupe window. Without
    // exclusions, the loop exits on the first iteration as before.
    const excluded = new Set(input.excludePhotoIds ?? [])
    const start = hash(input.seed) % list.length
    for (let i = 0; i < list.length; i++) {
      const pick = list[(start + i) % list.length]
      if (excluded.has(pick.id)) continue
      const url2 = pick.urls?.regular
      const photographer = pick.user?.name
      const photographerLink = pick.user?.links?.html
      const photoPage = pick.links?.html
      const downloadLocation = pick.links?.download_location
      if (
        !url2 ||
        !photographer ||
        !photographerLink ||
        !photoPage ||
        !downloadLocation
      ) {
        // Missing the fields we need for attribution — skip rather
        // than render an under-credited photo. Keep walking in case
        // a later result has the fields populated.
        continue
      }
      return {
        id: pick.id,
        url: url2,
        photographerName: photographer,
        photographerUrl: appendUtm(photographerLink),
        unsplashPageUrl: appendUtm(photoPage),
        trackDownloadUrl: downloadLocation,
        altDescription: pick.alt_description ?? null,
      }
    }
    // Every candidate was excluded or under-credited.
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fire-and-forget hit to Unsplash's download tracking endpoint. Per
 * their guidelines this is required when a photo is "used" — i.e.
 * suggested to a user via our app, regardless of whether the user
 * actually downloads or posts it. Called from the cron right after
 * the photo is picked. Never throws; failures are logged.
 */
export async function trackUnsplashDownload(trackUrl: string): Promise<void> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim()
  if (!key) return
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    await fetch(trackUrl, {
      headers: {
        'accept-version': 'v1',
        authorization: `Client-ID ${key}`,
      },
      signal: controller.signal,
    })
  } catch (err) {
    console.warn('[social] unsplash download tracking failed', err)
  } finally {
    clearTimeout(timer)
  }
}

// Unsplash asks API users to include a UTM tag on attribution links
// (matches the public license boilerplate). Helps their photographers
// see traffic coming back.
function appendUtm(href: string): string {
  const sep = href.includes('?') ? '&' : '?'
  return `${href}${sep}utm_source=myhotelops&utm_medium=referral`
}

// FNV-1a, 32-bit — same hash as topics.ts. Inlined here so this module
// stays standalone (no import cycle).
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h
}
