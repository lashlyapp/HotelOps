'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils/cn'
import { submitSignupRequest, type SignupActionResult } from '../actions'

const initial: SignupActionResult = {}

const TEXTAREA_CLASSES = cn(
  'w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg shadow-xs',
  'placeholder:text-subtle',
  'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]',
  'focus-ring focus:border-border-strong',
  'disabled:cursor-not-allowed disabled:opacity-50',
)

export function SignupForm() {
  const [state, action, pending] = useActionState(
    submitSignupRequest,
    initial,
  )

  return (
    <form action={action} className="space-y-4" noValidate>
      {/* Honeypot: hidden from real users, bots fill every field. If this
          arrives non-empty the action redirects to /thanks silently. */}
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
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
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

      <div className="space-y-1.5">
        <Label htmlFor="phone">
          Phone <span className="text-subtle">(optional)</span>
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={40}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="message">
          Anything else? <span className="text-subtle">(optional)</span>
        </Label>
        <textarea
          id="message"
          name="message"
          rows={4}
          maxLength={2000}
          className={TEXTAREA_CLASSES}
          placeholder="How many properties, what you're hoping to solve, when you'd like to be up and running…"
        />
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
          , and consent to be contacted by the team about my account.
        </span>
      </label>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? 'Sending…' : 'Create account'}
      </Button>
    </form>
  )
}
