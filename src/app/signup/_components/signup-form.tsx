'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { submitSignupRequest, type SignupActionResult } from '../actions'

const initial: SignupActionResult = {}

/**
 * Localized signup form. Parent passes the visitor-locale dictionary
 * so every label / placeholder / hint / CTA renders in the right
 * language; server action also resolves the locale and returns
 * localized error strings.
 */
export function SignupForm({ t }: { t: Dictionary['signup'] }) {
  const [state, action, pending] = useActionState(
    submitSignupRequest,
    initial,
  )

  return (
    <form action={action} className="space-y-4" noValidate>
      {/* Honeypot: hidden from real users, bots fill every field. */}
      <div className="hidden" aria-hidden>
        <Label htmlFor="website">Website</Label>
        <Input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="full_name">{t.form.yourName}</Label>
          <Input
            id="full_name"
            name="full_name"
            type="text"
            autoComplete="name"
            required
            maxLength={200}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="hotel_name">{t.form.hotelName}</Label>
          <Input
            id="hotel_name"
            name="hotel_name"
            type="text"
            autoComplete="organization"
            required
            maxLength={200}
            placeholder={t.form.hotelNamePlaceholder}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">{t.form.workEmail}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{t.form.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="text-xs text-subtle">
          {t.form.passwordHint}
        </p>
      </div>

      <label className="flex items-start gap-3 text-xs text-muted leading-relaxed">
        <input
          type="checkbox"
          name="consent"
          value="yes"
          required
          className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border-default text-fg focus-ring"
        />
        {/* Segmented copy — same grammatical order in en/es/fr so the
            link slots can stay positional. If we ever add a locale
            with a different word order we'd switch to a richer
            interpolation pattern. */}
        <span>
          {t.form.consentPrefix}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-fg hover:underline"
          >
            {t.form.consentTerms}
          </a>
          {t.form.consentAnd}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-fg hover:underline"
          >
            {t.form.consentPrivacy}
          </a>
          {t.form.consentSuffix}
        </span>
      </label>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? t.form.ctaSending : t.form.ctaSend}
      </Button>

      <p className="text-center text-xs text-subtle">
        {t.form.noCardLine}
      </p>
    </form>
  )
}
