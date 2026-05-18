'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import {
  setOrgWantsOnboardingSessionAction,
  type ActionResult,
} from '@/lib/admin/actions'

const initial: ActionResult = {}

/**
 * Platform-admin toggle for the optional $150-per-property onboarding
 * session. Customers set this themselves at signup via the checkbox
 * on /signup; this card is the support backstop for "I forgot to
 * check the box" or "we'd like to skip it after all" calls.
 *
 * Flipping the flag gates whether every subsequent subscription start
 * for this org attaches the hotelops_setup_fee line item — once per
 * property. It doesn't retroactively invoice properties already
 * created.
 */
export function OnboardingSessionSection({
  orgId,
  wantsOnboardingSession,
}: {
  orgId: string
  wantsOnboardingSession: boolean
}) {
  const [state, action, pending] = useActionState(
    setOrgWantsOnboardingSessionAction,
    initial,
  )

  const nextValue = wantsOnboardingSession ? 'no' : 'yes'
  const buttonLabel = wantsOnboardingSession
    ? 'Disable onboarding session'
    : 'Enable onboarding session'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboarding session</CardTitle>
      </CardHeader>
      <CardBody>
        <dl className="text-sm">
          <div>
            <dt className="text-xs text-subtle">Opted in at signup</dt>
            <dd className="mt-0.5 text-fg">
              {wantsOnboardingSession ? 'Yes' : 'No'}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-subtle leading-relaxed">
          Customers opt in via the checkbox on /signup. While enabled,
          every new property pays a $150 onboarding fee on its first
          invoice. Toggling it here only gates future property starts —
          properties already created aren&apos;t retroactively charged
          or refunded.
        </p>

        <form action={action} className="mt-4 space-y-2">
          <input type="hidden" name="org_id" value={orgId} />
          <input
            type="hidden"
            name="wants_onboarding_session"
            value={nextValue}
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Saving…' : buttonLabel}
          </Button>
          {state.error ? (
            <p className="text-sm text-danger-fg">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-success-fg">{state.success}</p>
          ) : null}
        </form>
      </CardBody>
    </Card>
  )
}
