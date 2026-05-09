'use client'

import { Button } from '@/components/ui/button'

export function DeleteButton({
  id,
  eventId,
  action,
  confirmMessage,
  label = 'Delete',
}: {
  id: string
  eventId?: string
  action: (formData: FormData) => void | Promise<void>
  confirmMessage: string
  label?: string
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      {eventId ? <input type="hidden" name="event_id" value={eventId} /> : null}
      <Button type="submit" variant="ghost" size="sm">
        {label}
      </Button>
    </form>
  )
}
