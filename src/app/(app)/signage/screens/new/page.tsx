import Link from 'next/link'
import { Card, CardBody } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { NewScreenForm } from './new-screen-form'
import { pairEntryUrl } from '../../_lib/player-url'

export default async function NewScreenPage() {
  const session = await requireOrgUser()

  return (
    <div className="p-4 sm:p-8 space-y-5 max-w-3xl">
      <div>
        <Link
          href="/signage"
          className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
        >
          ← Back to screens
        </Link>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-fg">
          Pair a new screen
        </h2>
        <p className="mt-1 text-sm text-muted">
          Give the screen a name and the property it lives in. You&apos;ll
          get a 6-digit code valid for 10 minutes.
        </p>
      </div>

      <Card>
        <CardBody>
          <NewScreenForm properties={session.properties} />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-2 text-sm text-muted">
          <h3 className="text-sm font-medium text-fg">On the TV</h3>
          <ol className="list-decimal space-y-1 pl-5 text-xs">
            <li>
              Open the browser and go to{' '}
              <span className="font-mono text-fg">{pairEntryUrl()}</span>.
            </li>
            <li>Enter the 6-digit code shown after you create the screen.</li>
            <li>The TV will navigate to its player URL and stay there.</li>
          </ol>
        </CardBody>
      </Card>
    </div>
  )
}
