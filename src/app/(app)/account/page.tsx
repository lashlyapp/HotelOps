import Link from 'next/link'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { signOut } from '@/app/login/actions'
import { requireSession } from '@/lib/auth/session'

export default async function AccountPage() {
  const session = await requireSession()

  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Account
        </h1>
        <p className="mt-1 text-sm text-muted">
          Your profile and session.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field label="Email">{session.email}</Field>
          <Field label="Role">
            <span className="capitalize">
              {session.profile.role.replace('_', ' ')}
            </span>
          </Field>
          <Field label="Organization">{session.organization.name}</Field>
          <Field label="Properties">
            {session.properties.length === 0
              ? '—'
              : session.properties.map((p) => p.name).join(', ')}
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-muted">
            Need to change your password?{' '}
            <Link href="/set-password" className="text-fg underline">
              Set a new one
            </Link>
            .
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={signOut}>
            <button
              type="submit"
              className="focus-ring rounded-md bg-danger-bg px-4 py-2 text-sm font-medium text-danger-fg hover:brightness-95 transition"
            >
              Sign out
            </button>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-3 gap-4 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="col-span-2 text-fg">{children}</dd>
    </div>
  )
}
