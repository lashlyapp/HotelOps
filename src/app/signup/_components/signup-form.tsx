'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PASSWORD_REQUIREMENTS_HINT } from '@/lib/auth/password'
import { submitSignupRequest, type SignupActionResult } from '../actions'

const initial: SignupActionResult = {}

export function SignupForm() {
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
          <Label htmlFor="full_name">Your name</Label>
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
          <Label htmlFor="hotel_name">Hotel name</Label>
          <Input
            id="hotel_name"
            name="hotel_name"
            type="text"
            autoComplete="organization"
            required
            maxLength={200}
            placeholder="e.g. The Coastal Inn"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
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
          {PASSWORD_REQUIREMENTS_HINT}
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
        <span>
          I agree to the{' '}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-fg hover:underline"
          >
            Terms of Service
          </a>
          {' '}and{' '}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-fg hover:underline"
          >
            Privacy Policy
          </a>
          .
        </span>
      </label>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? 'Creating your trial…' : 'Start free 7-day trial'}
      </Button>

      <p className="text-center text-xs text-subtle">
        No credit card required. 10 GB of media included.
      </p>
    </form>
  )
}
