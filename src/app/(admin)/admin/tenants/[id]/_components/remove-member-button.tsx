'use client'

import { Button } from '@/components/ui/button'
import { removeOrgMemberAction } from '@/lib/admin/actions'

export function RemoveMemberButton({
  orgId,
  userId,
}: {
  orgId: string
  userId: string
}) {
  return (
    <form
      action={removeOrgMemberAction}
      onSubmit={(e) => {
        if (
          !confirm(
            'Remove this member from the org? Their account stays but loses access.',
          )
        ) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="user_id" value={userId} />
      <Button type="submit" variant="ghost" size="sm">
        Remove
      </Button>
    </form>
  )
}
