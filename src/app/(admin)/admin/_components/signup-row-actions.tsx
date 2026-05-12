'use client'

import { Button } from '@/components/ui/button'
import {
  approveSignupAction,
  rejectSignupAction,
} from '@/lib/admin/actions'

export function SignupRowActions({
  signupId,
  hotelName,
}: {
  signupId: string
  hotelName: string
}) {
  return (
    <div className="flex items-center gap-2">
      <form
        action={approveSignupAction}
        onSubmit={(e) => {
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
        <Button type="submit" size="sm">
          Approve
        </Button>
      </form>
      <form
        action={rejectSignupAction}
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
        <Button type="submit" variant="ghost" size="sm">
          Reject
        </Button>
      </form>
    </div>
  )
}
