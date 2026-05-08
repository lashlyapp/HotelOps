'use client'

import { Button } from '@/components/ui/button'
import { ownerRemovePropertyAction } from '@/lib/admin/actions'

export function RemovePropertyButton({ propertyId }: { propertyId: string }) {
  return (
    <form
      action={ownerRemovePropertyAction}
      onSubmit={(e) => {
        if (
          !confirm(
            'Remove this property from the catalog? Files in R2 are not deleted — only the catalog entry.',
          )
        ) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="property_id" value={propertyId} />
      <Button type="submit" variant="ghost" size="sm">
        Remove
      </Button>
    </form>
  )
}
