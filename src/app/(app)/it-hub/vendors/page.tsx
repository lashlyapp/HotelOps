import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ItVendor } from '@/lib/supabase/types'
import { deleteVendorAction } from '../actions'
import { DeleteButton } from '../_components/delete-button'
import { Disclosure } from '../_components/disclosure'
import { VENDOR_TYPE_LABELS } from '../_lib/labels'
import { VendorForm } from './_components/vendor-form'

export default async function VendorsPage() {
  const session = await requireOrgUser()
  const orgId = session.organization.id

  const admin = createAdminClient()
  const { data } = await admin
    .from('it_vendors')
    .select('*')
    .eq('org_id', orgId)
    .order('is_emergency', { ascending: false })
    .order('vendor_type', { ascending: true })
    .order('name', { ascending: true })
  const vendors = (data ?? []) as ItVendor[]
  const propertyById = new Map(session.properties.map((p) => [p.id, p]))

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-fg">
          Vendors &amp; IT contacts
        </h2>
        <p className="mt-1 text-sm text-muted">
          Internet provider, IT support, software vendors, and anyone else
          you’d call when something’s on fire. Mark the ones that take
          after-hours calls so the front desk knows who’s safe to ring at 2am.
        </p>
      </div>

      {vendors.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-muted">
            No vendors saved yet. Start with your internet provider and your
            IT support — those are the calls you’ll make when guests are
            complaining.
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border-subtle">
            {vendors.map((v) => {
              const prop = v.property_id ? propertyById.get(v.property_id) : null
              return (
                <li key={v.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-fg">{v.name}</p>
                        <Badge tone="info">
                          {VENDOR_TYPE_LABELS[v.vendor_type]}
                        </Badge>
                        {v.is_emergency ? (
                          <Badge tone="danger">After-hours OK</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-subtle">
                        {prop ? prop.name : 'All properties'}
                        {v.contact_name ? ` · ${v.contact_name}` : ''}
                      </p>
                    </div>
                    <DeleteButton
                      id={v.id}
                      action={deleteVendorAction}
                      confirmMessage={`Delete vendor "${v.name}"?`}
                    />
                  </div>

                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <Field label="Phone">
                      {v.phone ? (
                        <a
                          href={`tel:${v.phone}`}
                          className="focus-ring rounded-sm text-fg hover:underline"
                        >
                          {v.phone}
                        </a>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </Field>
                    <Field label="Email">
                      {v.email ? (
                        <a
                          href={`mailto:${v.email}`}
                          className="focus-ring rounded-sm text-fg hover:underline"
                        >
                          {v.email}
                        </a>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </Field>
                    <Field label="Website / portal">
                      {v.website ? (
                        <a
                          href={v.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="focus-ring rounded-sm text-fg underline hover:text-primary break-all"
                        >
                          {v.website}
                        </a>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </Field>
                    <Field label="Account number">
                      {v.account_number ?? (
                        <span className="text-subtle">—</span>
                      )}
                    </Field>
                    {v.support_hours ? (
                      <Field label="Support hours">{v.support_hours}</Field>
                    ) : null}
                  </dl>

                  {v.notes ? (
                    <p className="mt-3 text-xs text-muted whitespace-pre-wrap">
                      {v.notes}
                    </p>
                  ) : null}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">
                      Edit
                    </summary>
                    <div className="mt-3">
                      <VendorForm
                        properties={session.properties}
                        existing={v}
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
          <CardTitle>Add a vendor</CardTitle>
        </CardHeader>
        <CardBody>
          <Disclosure buttonLabel="Add vendor">
            <VendorForm properties={session.properties} />
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
      <dd className="mt-0.5 text-fg">{children}</dd>
    </div>
  )
}
