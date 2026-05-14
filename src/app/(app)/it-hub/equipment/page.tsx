import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ItEquipment, ItEquipmentStatus } from '@/lib/supabase/types'
import { deleteEquipmentAction } from '../actions'
import { DeleteButton } from '../_components/delete-button'
import { Disclosure } from '../_components/disclosure'
import {
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUS_LABELS,
} from '../_lib/labels'
import { EquipmentForm } from './_components/equipment-form'

const STATUS_TONE: Record<ItEquipmentStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  active: 'success',
  spare: 'neutral',
  retired: 'neutral',
  broken: 'danger',
}

export default async function EquipmentPage() {
  const session = await requireOrgUser()
  const orgId = session.organization.id

  const admin = createAdminClient()
  const { data } = await admin
    .from('it_equipment')
    .select('*')
    .eq('org_id', orgId)
    .order('property_id', { ascending: true })
    .order('category', { ascending: true })
    .order('name', { ascending: true })
  const equipment = (data ?? []) as ItEquipment[]
  const propertyById = new Map(session.properties.map((p) => [p.id, p]))

  const today = new Date()
  const soon = new Date(today)
  soon.setDate(today.getDate() + 60)

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-fg">
          Equipment
        </h2>
        <p className="mt-1 text-sm text-muted">
          A simple inventory of every connected device — TVs, routers, POS
          terminals, printers, cameras, and smart locks. Useful when something
          stops working and you need a serial number fast.
        </p>
      </div>

      {session.properties.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-muted">
            Add a property first, then come back to log its equipment.
          </CardBody>
        </Card>
      ) : equipment.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-muted">
            No equipment logged yet. Start with the lobby router and the POS —
            those are the ones you’ll need details for first.
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">Equipment</th>
                <th className="px-4 py-3 font-medium">Where</th>
                <th className="px-4 py-3 font-medium">Make / model</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Warranty</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {equipment.map((e) => {
                const prop = propertyById.get(e.property_id)
                const warrantyDate = e.warranty_until
                  ? new Date(e.warranty_until)
                  : null
                const expiringSoon =
                  warrantyDate && warrantyDate >= today && warrantyDate <= soon
                const expired = warrantyDate && warrantyDate < today
                return (
                  <tr key={e.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-fg">{e.name}</p>
                      <p className="mt-0.5 text-xs text-subtle">
                        {EQUIPMENT_CATEGORY_LABELS[e.category]}
                      </p>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">
                          Edit
                        </summary>
                        <div className="mt-3 max-w-xl">
                          <EquipmentForm
                            properties={session.properties}
                            existing={e}
                          />
                        </div>
                      </details>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <p className="text-fg">{prop?.name ?? '—'}</p>
                      {e.location ? (
                        <p className="text-xs text-subtle">{e.location}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <p className="text-fg">{e.make_model ?? '—'}</p>
                      {e.serial_number ? (
                        <p className="text-xs text-subtle">
                          SN: {e.serial_number}
                        </p>
                      ) : null}
                      {e.ip_address ? (
                        <p className="text-xs text-subtle">
                          IP: <code className="font-mono">{e.ip_address}</code>
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[e.status]}>
                        {EQUIPMENT_STATUS_LABELS[e.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {warrantyDate ? (
                        <span
                          className={
                            expired
                              ? 'text-danger-fg'
                              : expiringSoon
                                ? 'text-warning-fg'
                                : ''
                          }
                        >
                          {warrantyDate.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <DeleteButton
                        id={e.id}
                        action={deleteEquipmentAction}
                        confirmMessage={`Delete "${e.name}"?`}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </Card>
      )}

      {session.properties.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Add equipment</CardTitle>
          </CardHeader>
          <CardBody>
            <Disclosure buttonLabel="Add equipment">
              <EquipmentForm properties={session.properties} />
            </Disclosure>
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
