import 'server-only'
import en from './dictionaries/en.json'
import es from './dictionaries/es.json'
import fr from './dictionaries/fr.json'
import type { Locale } from './locales'

/**
 * Authoritative dictionary shape. Derived from the English JSON so
 * any key missing in es.json / fr.json is a compile-time error rather
 * than a runtime fallback to undefined. Translators add keys to en
 * first, then mirror.
 */
export type Dictionary = typeof en

const dictionaries: Record<Locale, Dictionary> = {
  en,
  // Static imports rather than lazy `import()` so the JSON ships
  // in-tree and we don't have to async-load on every page. Total
  // payload for three locales is ~6 KB; pre-bundling is fine.
  es: es as Dictionary,
  fr: fr as Dictionary,
}

/** Get the dictionary for a locale. Always synchronous because all
 *  three JSON files are statically imported above. */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale]
}
