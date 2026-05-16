/**
 * UTM attribution helpers shared by the client-side capture component
 * and the server-side reader on /signup.
 *
 * Capture model: when a visitor first lands on a marketing page with
 * any utm_* query parameter, the client component writes the params
 * to a 90-day cookie named UTM_COOKIE. The /signup page reads that
 * cookie server-side and passes the values through to the signup
 * action, which persists them on signup_pending and (after OTP
 * verify) on the organization row. From that point onward we know
 * exactly which ad campaign produced which paying customer.
 *
 * Why a cookie instead of sessionStorage: ad campaigns route to the
 * landing page (/) more often than directly to /signup. The user
 * browses, leaves, comes back the next day, and signs up. Cookies
 * survive the "leaves and comes back" — sessionStorage doesn't.
 *
 * 90 days is the default attribution window most ad platforms use;
 * matching it keeps our internal CAC math comparable to what Meta /
 * Google show in their dashboards.
 */

export const UTM_COOKIE = 'utm_attribution'
export const UTM_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60

export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const

export type UtmKey = (typeof UTM_KEYS)[number]

export type UtmAttribution = Partial<Record<UtmKey, string>> & {
  referrer?: string
}

/** Serialize attribution to a compact string for cookie storage.
 *  JSON.stringify is fine — these values are short, the cookie size
 *  is well under the 4KB limit. */
export function serializeUtm(attr: UtmAttribution): string {
  return JSON.stringify(attr)
}

export function deserializeUtm(raw: string | undefined | null): UtmAttribution {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as UtmAttribution
  } catch {
    return {}
  }
}

/** Pull UTM params out of a URL's search string. Caps each value at
 *  255 chars so a malicious or malformed URL can't bloat the cookie
 *  (and later the DB column). */
export function readUtmFromSearchParams(
  params: URLSearchParams,
): UtmAttribution {
  const out: UtmAttribution = {}
  for (const key of UTM_KEYS) {
    const value = params.get(key)
    if (value) out[key] = value.slice(0, 255)
  }
  return out
}
