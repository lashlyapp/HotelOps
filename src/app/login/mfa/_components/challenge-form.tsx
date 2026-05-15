'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { verifyLoginMfa } from '../actions'

const ERRORS: Record<string, string> = {
  wrong_code: 'That code didn’t match. Try the next one your app shows.',
  invalid: 'Enter the 6-digit code from your authenticator app.',
  unknown: 'Something went wrong. Try again or sign in fresh.',
}

export function MfaChallengeForm({
  factorId,
  initialError,
}: {
  factorId: string
  initialError?: string
}) {
  return (
    <form action={verifyLoginMfa} className="space-y-4" noValidate>
      <input type="hidden" name="factor_id" value={factorId} />

      <div className="space-y-1.5">
        <Label htmlFor="code">Code</Label>
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

      {initialError ? (
        <p className="text-sm text-danger-fg">
          {ERRORS[initialError] ?? ERRORS.unknown}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? 'Verifying…' : 'Verify and continue'}
    </Button>
  )
}
