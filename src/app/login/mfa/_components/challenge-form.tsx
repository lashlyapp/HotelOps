'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { verifyLoginMfa } from '../actions'

export function MfaChallengeForm({
  factorId,
  initialError,
  t,
}: {
  factorId: string
  initialError?: string
  t: Dictionary['loginMfa']
}) {
  const errorMessage =
    initialError && initialError in t.errors
      ? t.errors[initialError as keyof typeof t.errors]
      : null

  return (
    <form action={verifyLoginMfa} className="space-y-4" noValidate>
      <input type="hidden" name="factor_id" value={factorId} />

      <div className="space-y-1.5">
        <Label htmlFor="code">{t.codeLabel}</Label>
        <Input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          minLength={6}
          autoComplete="one-time-code"
          required
          autoFocus
          className="text-center text-2xl tracking-[0.5em] font-mono"
        />
      </div>

      {errorMessage ? (
        <p className="text-sm text-danger-fg">{errorMessage}</p>
      ) : null}

      <SubmitButton t={t} />
    </form>
  )
}

function SubmitButton({ t }: { t: Dictionary['loginMfa'] }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? t.ctaVerifying : t.ctaVerify}
    </Button>
  )
}
