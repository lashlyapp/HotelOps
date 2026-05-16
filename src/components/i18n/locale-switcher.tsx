'use client'

import { setLocale } from '@/lib/i18n/actions'
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n/locales'

/**
 * Compact locale picker for the public footer. Submits the parent
 * form on `change` so the user doesn't need to click an explicit
 * "Set" button — Apple-style "pick and it persists" UX.
 *
 * Falls back to a visible Set button inside <noscript> so visitors
 * with JS disabled can still switch. Server-side `setLocale` action
 * writes the cookie and revalidates the layout.
 *
 * Active locale is passed in by the server-rendered caller; the
 * switcher itself does not read cookies (server concern).
 */
export function LocaleSwitcher({ current }: { current: Locale }) {
  return (
    <form action={setLocale} className="inline-flex items-center gap-2">
      <label htmlFor="locale-switcher" className="text-xs text-subtle" aria-hidden>
        🌐
      </label>
      <select
        id="locale-switcher"
        name="locale"
        defaultValue={current}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-border-default bg-surface px-2 py-1 text-xs text-fg focus-ring"
        aria-label="Choose language"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
      <noscript>
        <button
          type="submit"
          className="rounded-md border border-border-default px-2 py-1 text-xs"
        >
          Set
        </button>
      </noscript>
    </form>
  )
}
