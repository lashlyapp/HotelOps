import Link from 'next/link'
import { Card, CardBody } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { NewEventForm } from './_components/new-event-form'

export default async function NewEventPage() {
  const session = await requireOrgUser()

  return (
    <div className="p-8 space-y-5 max-w-3xl">
      <div>
        <Link
          href="/events"
          className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
        >
          ← All events
        </Link>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-fg">
          New event inquiry
        </h2>
        <p className="mt-1 text-sm text-muted">
          Capture the basics. You can build out the schedule, line items, and
          proposal once it&apos;s saved.
        </p>
      </div>

      {session.properties.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-muted">
            Add a property first, then come back here to create an event.
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <NewEventForm properties={session.properties} />
          </CardBody>
        </Card>
      )}
    </div>
  )
}
