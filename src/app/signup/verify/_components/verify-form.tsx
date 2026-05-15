'use client'

import { useActionState, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OTP_LENGTH } from '@/lib/auth/otp-constants'
import {
  resendSignupOtp,
  verifySignupOtp,
  type SignupActionResult,
} from '../../actions'

const initial: SignupActionResult = {}

export function VerifyForm({ email }: { email: string }) {
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifySignupOtp,
    initial,
  )
  const [resendState, resendAction, resendPending] = useActionState(
    resendSignupOtp,
    initial,
  )
  // Boolean "we just resent" pill that auto-clears after a few seconds.
  // Effect-driven so render stays pure.
  const [resentRecently, setResentRecently] = useState(false)
  useEffect(() => {
    if (!resentRecently) return
    const handle = setTimeout(() => setResentRecently(false), 8000)
    return () => clearTimeout(handle)
  }, [resentRecently])

  return (
    <div className="space-y-5">
      <form action={verifyAction} className="space-y-4" noValidate>
        <input type="hidden" name="email" value={email} />

        <div className="space-y-1.5">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            pattern={`[0-9]{${OTP_LENGTH}}`}
            maxLength={OTP_LENGTH}
            minLength={OTP_LENGTH}
            autoComplete="one-time-code"
            required
            autoFocus
            className="text-center text-2xl tracking-[0.5em] font-mono"
            aria-describedby="code-hint"
          />
          <p id="code-hint" className="text-xs text-subtle">
            {OTP_LENGTH} digits, from the email we just sent.
          </p>
        </div>

        {verifyState.error ? (
          <p className="text-sm text-danger-fg">{verifyState.error}</p>
        ) : null}

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={verifyPending}
        >
          {verifyPending ? 'Verifying…' : 'Verify and start trial'}
        </Button>
      </form>

      <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-4 text-xs text-muted">
        <span>Didn’t get the email?</span>
        <form action={resendAction}>
          <input type="hidden" name="email" value={email} />
          <button
            type="submit"
            disabled={resendPending}
            onClick={() => setResentRecently(true)}
            className="focus-ring rounded-sm font-medium text-fg hover:underline disabled:opacity-50"
          >
            {resendPending ? 'Sending…' : 'Resend code'}
          </button>
        </form>
      </div>

      {resendState.error ? (
        <p className="text-xs text-danger-fg">{resendState.error}</p>
      ) : resentRecently && !resendState.error ? (
        <p className="text-xs text-success-fg">
          A new code is on its way.
        </p>
      ) : null}
    </div>
  )
}
