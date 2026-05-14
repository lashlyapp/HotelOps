'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MIN_PASSWORD_LENGTH, PASSWORD_RULES } from '@/lib/auth/password'
import { changePasswordAction, type ActionResult } from '../actions'

const initial: ActionResult = {}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial)
  const formRef = useRef<HTMLFormElement>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const checklistId = useId()

  useEffect(() => {
    if (!state.success) return
    formRef.current?.reset()
    // Clear the controlled mirrors of the inputs once the server action
    // succeeds — formRef.reset() handles the DOM, but the React state
    // needs an explicit reset for the live checklist to flip back to
    // its empty-input rendering. The set-state-in-effect lint flags
    // this as a smell, but here the trigger is a server-action result
    // we can only observe via useEffect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPassword('')
    setConfirm('')
  }, [state.success])

  const ruleResults = PASSWORD_RULES.map((rule) => ({
    rule,
    met: rule.test(password),
  }))
  const allRulesMet = ruleResults.every((r) => r.met)
  const confirmMatches = confirm.length > 0 && confirm === password
  const canSubmit = allRulesMet && confirmMatches && !pending

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          aria-describedby={checklistId}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ul id={checklistId} className="space-y-1 pt-1">
          {ruleResults.map(({ rule, met }) => (
            <RuleItem key={rule.id} met={met} pristine={password.length === 0}>
              {rule.label}
            </RuleItem>
          ))}
        </ul>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={confirm.length > 0 && !confirmMatches}
        />
        {confirm.length > 0 ? (
          <RuleItem met={confirmMatches} pristine={false}>
            Passwords match
          </RuleItem>
        ) : null}
      </div>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}

      <Button type="submit" disabled={!canSubmit}>
        {pending ? 'Saving…' : 'Update password'}
      </Button>
    </form>
  )
}

function RuleItem({
  met,
  pristine,
  children,
}: {
  met: boolean
  // Pre-input: render the bullet in the muted color so the form doesn't
  // look like a wall of red errors before the user has typed anything.
  pristine: boolean
  children: React.ReactNode
}) {
  const tone = pristine
    ? 'text-subtle'
    : met
      ? 'text-success-fg'
      : 'text-muted'
  return (
    <li className={`flex items-center gap-2 text-xs ${tone}`}>
      <Mark met={met} pristine={pristine} />
      <span>{children}</span>
    </li>
  )
}

function Mark({ met, pristine }: { met: boolean; pristine: boolean }) {
  if (met) {
    return (
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5 shrink-0"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    )
  }
  // Empty circle for unmet rules — softer than a red ✗ before the user
  // has had a chance to satisfy each rule.
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={pristine ? 1.5 : 2}
      className="size-3.5 shrink-0"
    >
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}
