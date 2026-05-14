import Link from 'next/link'
import { Card, CardBody } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { NewTaskForm } from '../_components/new-task-form'

type SearchParams = Promise<{ property?: string }>

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await requireOrgUser()
  const { property: propertySlug } = await searchParams
  const defaultProperty =
    session.properties.find((p) => p.slug === propertySlug) ??
    session.properties[0]

  return (
    <div className="p-4 sm:p-8 space-y-5 max-w-3xl">
      <div>
        <Link
          href="/tasks"
          className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
        >
          ← Back to board
        </Link>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-fg">
          Capture a new task
        </h2>
        <p className="mt-1 text-sm text-muted">
          Snap a photo or a short clip first. Pick a category. Hit save.
        </p>
      </div>

      <Card>
        <CardBody>
          <NewTaskForm
            properties={session.properties}
            defaultPropertyId={defaultProperty?.id}
          />
        </CardBody>
      </Card>
    </div>
  )
}
