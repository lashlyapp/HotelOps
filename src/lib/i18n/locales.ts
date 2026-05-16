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

export const LOCALES = ['en', 'es', 'fr'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/** Human-readable name for each locale (in the locale itself).
 *  Authenticator-style: a Spanish speaker sees "Español", not "Spanish". */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
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
