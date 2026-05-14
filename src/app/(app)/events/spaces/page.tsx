import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EventSpace } from '@/lib/supabase/types'
import { deleteSpaceAction } from '../actions'
import { DeleteButton } from '../_components/delete-button'
import { Disclosure } from '../_components/disclosure'
import { formatMoney } from '../_lib/money'
import { SpaceForm } from './_components/space-form'

export default async function SpacesPage() {
  const session = await requireOrgUser()
  const properties = session.properties

  const admin = createAdminClient()
  const { data } = await admin
    .from('event_spaces')
    .select('*')
    .eq('org_id', session.organization.id)
    .order('property_id', { ascending: true })
    .order('name', { ascending: true })
  const spaces = (data ?? []) as EventSpace[]
  const propertyById = new Map(properties.map((p) => [p.id, p]))

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-fg">
          Event spaces
        </h2>
        <p className="mt-1 text-sm text-muted">
          Set up the bookable rooms and outdoor areas — Ballroom, Garden,
          Boardroom — so you can assign them to events and quote rates.
        </p>
      </div>

      {properties.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-muted">
            Add a property first, then come back here to set up its spaces.
          </CardBody>
        </Card>
      ) : spaces.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-muted">
            No spaces yet. Add the largest one first — that&apos;s usually the
            ballroom.
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border-subtle">
            {spaces.map((s) => {
              const prop = propertyById.get(s.property_id)
              return (
                <li key={s.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-fg">{s.name}</p>
                        {!s.is_active ? (
                          <span className="text-xs text-subtle">(inactive)</span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-subtle">
                        {prop?.name ?? 'Unknown property'}
                      </p>
                    </div>
                    <DeleteButton
                      id={s.id}
                      action={deleteSpaceAction}
                      confirmMessage={`Delete space "${s.name}"?`}
                    />
                  </div>

                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                    <Field label="Seated">
                      {s.capacity_seated ?? '—'}
                    </Field>
                    <Field label="Standing">
                      {s.capacity_standing ?? '—'}
                    </Field>
                    <Field label="Hourly">
                      {s.hourly_rate_cents
                        ? formatMoney(s.hourly_rate_cents)
                        : '—'}
                    </Field>
                    <Field label="Flat">
                      {s.flat_rate_cents
                        ? formatMoney(s.flat_rate_cents)
                        : '—'}
                    </Field>
                  </dl>

                  {s.notes ? (
                    <p className="mt-3 text-xs text-muted whitespace-pre-wrap">
                      {s.notes}
                    </p>
                  ) : null}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">
                      Edit
                    </summary>
                    <div className="mt-3">
                      <SpaceForm properties={properties} existing={s} />
                    </div>
                  </details>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {properties.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Add a space</CardTitle>
          </CardHeader>
          <CardBody>
            <Disclosure buttonLabel="Add space">
              <SpaceForm properties={properties} />
            </Disclosure>
          </CardBody>
        </Card>
      ) : null}
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
      <dd className="mt-0.5 text-fg tabular-nums">{children}</dd>
    </div>
  )
}
