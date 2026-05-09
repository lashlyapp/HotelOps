'use client'

import { Button } from '@/components/ui/button'

export function DeleteButton({
  id,
  action,
  confirmMessage,
}: {
  id: string
  action: (formData: FormData) => void | Promise<void>
  confirmMessage: string
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm">
        Delete
      </Button>
    </form>
  )
}
