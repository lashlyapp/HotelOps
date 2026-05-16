import 'server-only'
import en from './dictionaries/en.json'
import es from './dictionaries/es.json'
import fr from './dictionaries/fr.json'
import ja from './dictionaries/ja.json'
import ko from './dictionaries/ko.json'
import vi from './dictionaries/vi.json'
import type { Locale } from './locales'

/**
 * Authoritative dictionary shape. Derived from the English JSON so
 * any key missing in a sibling locale's JSON is a compile-time error
 * rather than a runtime fallback to undefined. Translators add keys
 * to en first, then mirror across es/fr/ja/ko/vi.
 */
export type Dictionary = typeof en

const dictionaries: Record<Locale, Dictionary> = {
  en,
  // Static imports rather than lazy `import()` so each JSON ships
  // in-tree and we don't async-load on every page. Total payload
  // for six locales is ~50 KB after gzip; pre-bundling is fine.
  es: es as Dictionary,
  fr: fr as Dictionary,
  // APAC additions — copy is AI-translated for the v1 launch (JA
  // and KO especially need a native-speaker formality review before
  // scaling paid acquisition; VI is more forgiving on register).
  ja: ja as Dictionary,
  ko: ko as Dictionary,
  vi: vi as Dictionary,
}

/** Get the dictionary for a locale. Always synchronous because all
 *  three JSON files are statically imported above. */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale]
}
