'use client'

import { useEffect } from 'react'
import {
  UTM_COOKIE,
  UTM_COOKIE_MAX_AGE_SECONDS,
  readUtmFromSearchParams,
  serializeUtm,
  type UtmAttribution,
} from '@/lib/marketing/utm'

/**
 * Mounts once on every public-shell page. On first render, reads
 * utm_* params from the URL; if any are present, writes them to a
 * 90-day cookie alongside `document.referrer`. The cookie is then
 * read server-side on /signup so the visitor's attribution survives
 * cross-page navigation (landing → pricing → signup is the typical
 * path).
 *
 * Renders nothing. Idempotent — running it on every page render is
 * fine, the cookie just gets re-written to the same value.
 *
 * NOT a client/server boundary concern: cookies set client-side are
 * not HttpOnly so server reads see the value on the next navigation.
 */
export function UtmCapture() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const utm = readUtmFromSearchParams(params)
    // Skip when no UTM params are on the URL — preserves any older
    // cookie set on a previous landing rather than overwriting it
    // with empty values from a direct navigation.
    if (Object.keys(utm).length === 0) return

    const attribution: UtmAttribution = { ...utm }
    if (document.referrer) attribution.referrer = document.referrer.slice(0, 255)

    const value = encodeURIComponent(serializeUtm(attribution))
    document.cookie = [
      `${UTM_COOKIE}=${value}`,
      `Max-Age=${UTM_COOKIE_MAX_AGE_SECONDS}`,
      'Path=/',
      'SameSite=Lax',
    ].join('; ')
  }, [])

  return null
}
