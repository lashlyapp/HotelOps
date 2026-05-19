'use client'

import { useState } from 'react'
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
 * Controlled via local state so the displayed value follows the
 * user's pick instantly, then realigns to the server-confirmed
 * `current` if the prop later changes (revalidation, navigation,
 * another tab). An uncontrolled `defaultValue` doesn't work here:
 * React 19 resets uncontrolled form fields after a server action,
 * and the reset happens before the parent re-renders with the new
 * cookie — so the select snaps back to the old language even though
 * the rest of the page is in the new one.
 */
export function LocaleSwitcher({ current }: { current: Locale }) {
  const [value, setValue] = useState<Locale>(current)
  // Adjust-state-on-prop-change pattern (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  // Lets the user's pick win immediately while still snapping back
  // to the server-confirmed locale when the prop later changes.
  const [prevCurrent, setPrevCurrent] = useState<Locale>(current)
  if (current !== prevCurrent) {
    setPrevCurrent(current)
    setValue(current)
  }

  return (
    <form action={setLocale} className="inline-flex items-center gap-2">
      <label htmlFor="locale-switcher" className="text-xs text-subtle" aria-hidden>
        🌐
      </label>
      <select
        id="locale-switcher"
        name="locale"
        value={value}
        onChange={(e) => {
          setValue(e.target.value as Locale)
          e.currentTarget.form?.requestSubmit()
        }}
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
