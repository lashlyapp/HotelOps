'use client'

import { Button } from '@/components/ui/button'
import { removePropertyAction } from '@/lib/admin/actions'

export function RemovePropertyButton({
  orgId,
  propertyId,
}: {
  orgId: string
  propertyId: string
}) {
  return (
    <form
      action={removePropertyAction}
      onSubmit={(e) => {
        if (
          !confirm(
            'Remove this property? Files in R2 are NOT deleted — only the catalog entry.',
          )
        ) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="property_id" value={propertyId} />
      <Button type="submit" variant="ghost" size="sm">
        Remove
      </Button>
    </form>
  )
}
