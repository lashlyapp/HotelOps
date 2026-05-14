import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ItNetwork } from '@/lib/supabase/types'
import { deleteNetworkAction } from '../actions'
import { DeleteButton } from '../_components/delete-button'
import { Disclosure } from '../_components/disclosure'
import { Secret } from '../_components/secret'
import { NETWORK_TYPE_LABELS } from '../_lib/labels'
import { NetworkForm } from './_components/network-form'

export default async function WifiPage() {
  const session = await requireOrgUser()
  const orgId = session.organization.id
  const properties = session.properties

  const admin = createAdminClient()
  const { data } = await admin
    .from('it_networks')
    .select('*')
    .eq('org_id', orgId)
    .order('network_type', { ascending: true })
    .order('label', { ascending: true })
  const networks = (data ?? []) as ItNetwork[]
  const propertyById = new Map(properties.map((p) => [p.id, p]))

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-fg">
            Wi-Fi networks
          </h2>
          <p className="mt-1 text-sm text-muted">
            Save the SSID and password for every network at the property —
            guest, staff, back-of-house, event spaces, and smart-device
            networks.
          </p>
        </div>
      </div>

      {properties.length === 0 ? (
        <EmptyNoProperties />
      ) : networks.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-muted">
            No networks saved yet. Add the guest Wi-Fi first so the front desk
            can find it in one click.
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border-subtle">
            {networks.map((n) => {
              const prop = propertyById.get(n.property_id)
              return (
                <li key={n.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-fg">{n.label}</p>
                        <Badge tone="info">
                          {NETWORK_TYPE_LABELS[n.network_type]}
                        </Badge>
                        {n.is_shareable ? (
                          <Badge tone="success">Safe to share</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-subtle">
                        {prop?.name ?? 'Unknown property'}
                        {n.band ? ` · ${n.band}` : ''}
                      </p>
                    </div>
                    <DeleteButton
                      id={n.id}
                      action={deleteNetworkAction}
                      confirmMessage={`Delete network "${n.label}"?`}
                    />
                  </div>

                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <Field label="Network (SSID)">
                      {n.ssid ? (
                        <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs">
                          {n.ssid}
                        </code>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </Field>
                    <Field label="Password">
                      <Secret value={n.password} />
                    </Field>
                  </dl>

                  {n.notes ? (
                    <p className="mt-3 text-xs text-muted whitespace-pre-wrap">
                      {n.notes}
                    </p>
                  ) : null}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">
                      Edit
                    </summary>
                    <div className="mt-3">
                      <NetworkForm
                        properties={properties}
                        existing={n}
                      />
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
            <CardTitle>Add a network</CardTitle>
          </CardHeader>
          <CardBody>
            <Disclosure buttonLabel="Add Wi-Fi network">
              <NetworkForm properties={properties} />
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
      <dd className="mt-0.5 text-fg">{children}</dd>
    </div>
  )
}

function EmptyNoProperties() {
  return (
    <Card>
      <CardBody className="text-sm text-muted">
        Add a property first, then come back here to save its Wi-Fi networks.
      </CardBody>
    </Card>
  )
}

