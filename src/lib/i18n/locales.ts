/**
 * Supported locales for the marketing surface. Authenticated app
 * (everything under (app) and (admin)) is intentionally NOT in scope
 * yet — translating internal UI labels is a much larger surface and
 * doesn't unblock acquisition. International visitors hit /, /pricing,
 * /signup, /login first; those are what we localize.
 *
 * To add a new locale:
 *   1. Add the code here.
 *   2. Add `src/lib/i18n/dictionaries/<code>.json` (must satisfy the
 *      Dictionary type — TypeScript will fail the build if a key is
 *      missing).
 *   3. Add the human-readable label to `LOCALE_LABELS` below for the
 *      locale switcher.
 *
 * No region tags (en-US / en-GB) — the marketing copy doesn't differ
 * by region and the extra granularity would just multiply translation
 * cost. Add region tags only if/when a regional price page demands it.
 */

export const LOCALES = ['en', 'es', 'fr', 'ja', 'ko', 'vi'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/** Human-readable name for each locale (in the locale itself).
 *  Authenticator-style: a Spanish speaker sees "Español", not "Spanish".
 *
 *  Note on the APAC additions (ja / ko / vi): copy was AI-translated
 *  for the initial launch. Japanese and Korean in particular are
 *  formality-sensitive in B2B contexts (敬語 in JA, 존댓말 in KO) —
 *  schedule a native-speaker review pass before scaling paid
 *  acquisition in those markets. Vietnamese has fewer formality
 *  landmines but should still get one editorial pass. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  ja: '日本語',
  ko: '한국어',
  vi: 'Tiếng Việt',
}

/** Cookie name. Matches Next.js's default convention so a future
 *  migration to URL-prefixed locales (/es/, /fr/) can read the same
 *  cookie without rewriting call sites. */
export const LOCALE_COOKIE = 'NEXT_LOCALE'

/** Type guard for narrowing arbitrary input (search params, cookie
 *  values, etc.) to a known locale. Returns the default for anything
 *  unrecognized so callers don't have to handle the miss case. */
export function asLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE
  return (LOCALES as readonly string[]).includes(value)
    ? (value as Locale)
    : DEFAULT_LOCALE
}
