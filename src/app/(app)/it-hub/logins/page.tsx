import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ItCredential } from '@/lib/supabase/types'
import { deleteCredentialAction } from '../actions'
import { DeleteButton } from '../_components/delete-button'
import { Disclosure } from '../_components/disclosure'
import { Secret } from '../_components/secret'
import { CREDENTIAL_CATEGORY_LABELS } from '../_lib/labels'
import { CredentialForm } from './_components/credential-form'

export default async function LoginsPage() {
  const session = await requireOrgUser()
  const orgId = session.organization.id

  const admin = createAdminClient()
  const { data } = await admin
    .from('it_credentials')
    .select('*')
    .eq('org_id', orgId)
    .order('category', { ascending: true })
    .order('service_name', { ascending: true })
  const credentials = (data ?? []) as ItCredential[]
  const propertyById = new Map(session.properties.map((p) => [p.id, p]))

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-fg">
          Vendor logins
        </h2>
        <p className="mt-1 text-sm text-muted">
          Property management, booking engine, social, accounting — every
          portal you sign into, in one place. Passwords are hidden by default.
        </p>
        <p className="mt-2 text-xs text-subtle">
          Tip: this is for shared accounts the team uses. Personal logins
          should stay personal.
        </p>
      </div>

      {credentials.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-muted">
            No logins saved yet. Start with the ones you reach for every week —
            your PMS, channel manager, and Instagram.
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border-subtle">
            {credentials.map((c) => {
              const prop = c.property_id ? propertyById.get(c.property_id) : null
              return (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-fg">{c.service_name}</p>
                        <Badge tone="info">
                          {CREDENTIAL_CATEGORY_LABELS[c.category]}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-subtle">
                        {prop ? prop.name : 'All properties'}
                      </p>
                    </div>
                    <DeleteButton
                      id={c.id}
                      action={deleteCredentialAction}
                      confirmMessage={`Delete login for "${c.service_name}"?`}
                    />
                  </div>

                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <Field label="URL">
                      {c.url ? (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="focus-ring rounded-sm text-fg underline hover:text-primary"
                        >
                          {c.url}
                        </a>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </Field>
                    <Field label="Username">
                      {c.username ?? <span className="text-subtle">—</span>}
                    </Field>
                    <Field label="Password">
                      <Secret value={c.password} />
                    </Field>
                  </dl>

                  {c.notes ? (
                    <p className="mt-3 text-xs text-muted whitespace-pre-wrap">
                      {c.notes}
                    </p>
                  ) : null}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">
                      Edit
                    </summary>
                    <div className="mt-3">
                      <CredentialForm
                        properties={session.properties}
                        existing={c}
                      />
                    </div>
                  </details>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a login</CardTitle>
        </CardHeader>
        <CardBody>
          <Disclosure buttonLabel="Add login">
            <CredentialForm properties={session.properties} />
          </Disclosure>
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
    <div>
      <dt className="text-xs uppercase tracking-wider text-subtle">{label}</dt>
      <dd className="mt-0.5 text-fg break-all">{children}</dd>
    </div>
  )
}
