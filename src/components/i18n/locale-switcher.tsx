'use client'

import { useOptimistic } from 'react'
import { setLocale } from '@/lib/i18n/actions'
import { LOCALES, LOCALE_LABELS, asLocale, type Locale } from '@/lib/i18n/locales'

/**
 * Compact locale picker for the public footer. Submits the parent
 * form on `change` so the user doesn't need to click an explicit
 * "Set" button — Apple-style "pick and it persists" UX.
 *
 * Falls back to a visible Set button inside <noscript> so visitors
 * with JS disabled can still switch. Server-side `setLocale` action
 * writes the cookie and revalidates the layout.
 *
 * Controlled via useOptimistic so the displayed value tracks the
 * user's pick instantly, then snaps to the server-confirmed value
 * after revalidation. Using an uncontrolled defaultValue here loses
 * the new pick — React 19 resets uncontrolled fields to their mount-
 * time defaultValue after a server action, so the select snaps back
 * to the old language even though the rest of the page renders in
 * the new one.
 */
export function LocaleSwitcher({ current }: { current: Locale }) {
  const [optimisticLocale, setOptimisticLocale] = useOptimistic(current)

  return (
    <form
      action={async (formData) => {
        setOptimisticLocale(asLocale(formData.get('locale')?.toString()))
        await setLocale(formData)
      }}
      className="inline-flex items-center gap-2"
    >
      <label htmlFor="locale-switcher" className="text-xs text-subtle" aria-hidden>
        🌐
      </label>
      <select
        id="locale-switcher"
        name="locale"
        value={optimisticLocale}
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
