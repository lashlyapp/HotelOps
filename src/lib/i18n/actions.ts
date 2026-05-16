'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, LOCALES, type Locale } from './locales'

/**
 * Set the locale cookie. Called from the LocaleSwitcher; affects
 * every subsequent request until the user changes it again or clears
 * cookies. revalidatePath('/') invalidates the marketing surface so
 * the new locale renders without a hard reload.
 *
 * Defensive: if the submitted value isn't a known locale we silently
 * ignore it rather than echoing back an error — the switcher itself
 * only emits valid values, so a bad value here is a tampered request.
 */
export async function setLocale(formData: FormData): Promise<void> {
  const raw = String(formData.get('locale') ?? '')
  if (!(LOCALES as readonly string[]).includes(raw)) return
  const locale = raw as Locale

  const jar = await cookies()
  jar.set(LOCALE_COOKIE, locale, {
    path: '/',
    // 1 year is the de-facto convention; renews on every set.
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    // No httpOnly: the switcher reads the current value client-side
    // to highlight the active option. Locale is non-sensitive.
    httpOnly: false,
  })
  revalidatePath('/', 'layout')
}
