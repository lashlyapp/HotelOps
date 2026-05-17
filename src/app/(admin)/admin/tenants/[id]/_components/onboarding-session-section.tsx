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
 * Platform-admin toggle for the optional 1-on-1 onboarding session.
 * Customers set this themselves at signup via the checkbox on /signup;
 * this card is the support backstop for "I forgot to check the box"
 * or "we'd like to skip it after all" calls.
 *
 * Flipping the flag does NOT retroactively invoice the fee. It only
 * gates whether the next subscription start attaches the
 * hotelops_setup_fee line item. The dedupe field
 * onboarding_fee_invoiced_at is shown read-only so an admin can see
 * whether the fee has already gone to Stripe for this org.
 */
export function OnboardingSessionSection({
  orgId,
  wantsOnboardingSession,
  feeInvoicedAt,
}: {
  orgId: string
  wantsOnboardingSession: boolean
  feeInvoicedAt: string | null
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
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-subtle">Opted in at signup</dt>
            <dd className="mt-0.5 text-fg">
              {wantsOnboardingSession ? 'Yes' : 'No'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">Fee invoiced</dt>
            <dd className="mt-0.5 text-fg">
              {feeInvoicedAt
                ? new Date(feeInvoicedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : '—'}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-subtle leading-relaxed">
          Customers opt in via the checkbox on /signup. Flip this only if a
          customer asks support to change their mind. Toggling on doesn&apos;t
          backfill the fee — it just opens the gate so the next subscription
          start attaches it.
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
