'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import {
  approveSignupAction,
  rejectSignupAction,
  type ActionResult,
} from '@/lib/admin/actions'

const initial: ActionResult = {}

export function SignupRowActions({
  signupId,
  hotelName,
  emailCollision,
}: {
  signupId: string
  hotelName: string
  /** True when the signup email already maps to an existing auth user.
   *  The approve action will refuse server-side; we also disable the
   *  client button so the operator notices before they click. */
  emailCollision: boolean
}) {
  const [approveState, approveAction, approving] = useActionState(
    approveSignupAction,
    initial,
  )
  const [rejectState, rejectAction, rejecting] = useActionState(
    rejectSignupAction,
    initial,
  )
  const state = approveState.error
    ? approveState
    : rejectState.error
      ? rejectState
      : approveState.success
        ? approveState
        : rejectState

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <form
          action={approveAction}
          onSubmit={(e) => {
            if (emailCollision) {
              e.preventDefault()
              alert(
                `Cannot approve: ${hotelName}'s signup email already has an account. ` +
                  `Reject this request, verify with the prospect, then onboard manually.`,
              )
              return
            }
            if (
              !confirm(
                `Approve "${hotelName}"? This creates the org, the initial property, the owner account, and emails them a setup link.`,
              )
            ) {
              e.preventDefault()
            }
          }}
        >
          <input type="hidden" name="signup_id" value={signupId} />
          <Button
            type="submit"
            size="sm"
            disabled={approving || rejecting || emailCollision}
            title={
              emailCollision
                ? 'This email already has an account. Reject and onboard manually.'
                : undefined
            }
          >
            {approving ? 'Approving…' : 'Approve'}
          </Button>
        </form>
        <form
          action={rejectAction}
          onSubmit={(e) => {
            const reason = prompt(
              `Reject "${hotelName}"? Optional reason (kept for audit, not sent to the prospect):`,
              '',
            )
            if (reason === null) {
              e.preventDefault()
              return
            }
            const form = e.currentTarget
            const input = form.querySelector(
              'input[name="reason"]',
            ) as HTMLInputElement | null
            if (input) input.value = reason
          }}
        >
          <input type="hidden" name="signup_id" value={signupId} />
          <input type="hidden" name="reason" value="" />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={approving || rejecting}
          >
            {rejecting ? 'Rejecting…' : 'Reject'}
          </Button>
        </form>
      </div>
      {state.error ? (
        <p className="max-w-xs text-right text-xs text-danger-fg">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="max-w-xs text-right text-xs text-success-fg">
          {state.success}
        </p>
      ) : null}
    </div>
  )
}
