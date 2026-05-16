import 'server-only'
import { cookies, headers } from 'next/headers'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALES,
  asLocale,
  type Locale,
} from './locales'

/**
 * Resolve the active locale for the current request. Server-only
 * because it touches cookies + headers.
 *
 * Priority:
 *   1. NEXT_LOCALE cookie — set by the locale switcher; persists the
 *      user's explicit choice across visits.
 *   2. Accept-Language — best guess on first visit, before they've
 *      chosen. We do simple prefix matching ("fr-FR" → "fr") which
 *      is good enough for our three-locale set; a full LookupLocale
 *      via @formatjs/intl-localematcher would be overkill.
 *   3. DEFAULT_LOCALE.
 *
 * Important: this DOES NOT redirect or rewrite the URL. The router
 * is still at /, /pricing, etc. The locale affects rendered text
 * only. When/if we migrate to /[lang]/ routes, this helper stays
 * but a `proxy.ts` matcher takes priority over the cookie.
 */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies()
  const fromCookie = jar.get(LOCALE_COOKIE)?.value
  if (fromCookie && (LOCALES as readonly string[]).includes(fromCookie)) {
    return fromCookie as Locale
  }

  const hdrs = await headers()
  const accept = hdrs.get('accept-language')
  if (accept) {
    // Parse "fr-FR,fr;q=0.9,en;q=0.8" → ["fr-FR", "fr", "en"], take
    // the highest-priority match. We don't honor q-values because
    // the order is already preference-sorted in practice and parsing
    // q isn't worth the bytes.
    const langs = accept
      .split(',')
      .map((s) => s.trim().split(';')[0])
      .filter(Boolean)
    for (const lang of langs) {
      const primary = lang.toLowerCase().split('-')[0]
      if ((LOCALES as readonly string[]).includes(primary)) {
        return primary as Locale
      }
    }
  }

  return DEFAULT_LOCALE
}

/** Convenience: typed-locale narrower for inputs from search params
 *  or other untrusted sources. Re-exported here so call sites pull
 *  everything from one module. */
export { asLocale, DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE } from './locales'
export type { Locale }
