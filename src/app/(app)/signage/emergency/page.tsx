import Link from 'next/link'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SignageScreen } from '@/lib/supabase/types'
import { clearEmergencyAction } from '../actions'
import { EmergencyForm } from './emergency-form'

export default async function EmergencyPage() {
  const session = await requireOrgUser()
  const isOwner = session.profile.role === 'org_owner'

  if (!isOwner) {
    return (
      <div className="p-4 sm:p-8">
        <Card>
          <CardBody className="text-sm text-muted">
            Emergency broadcast requires owner role.
          </CardBody>
        </Card>
      </div>
    )
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('signage_screens')
    .select('*')
    .eq('org_id', session.organization.id)
    .not('emergency_until', 'is', null)
    .order('emergency_until', { ascending: false })
  const active = ((data ?? []) as SignageScreen[]).filter((s) => {
    if (!s.emergency_until) return false
    return new Date(s.emergency_until) > new Date()
  })
  const propertyById = new Map(session.properties.map((p) => [p.id, p]))

  // Group active broadcasts by property — the operator sees one row per
  // property, not one per screen, because broadcasts fire property-wide.
  const grouped = new Map<string, SignageScreen[]>()
  for (const s of active) {
    const list = grouped.get(s.property_id) ?? []
    list.push(s)
    grouped.set(s.property_id, list)
  }

  return (
    <div className="p-4 sm:p-8 space-y-5 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Send a broadcast</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          <p className="text-sm text-muted">
            Pushes a fullscreen takeover to every screen at one property.
            Use for evacuations or critical guest notices. Active for the
            duration you set, clearable in one click.
          </p>
          <EmergencyForm properties={session.properties} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active broadcasts</CardTitle>
        </CardHeader>
        <CardBody>
          {grouped.size === 0 ? (
            <p className="text-sm text-muted">No active broadcasts.</p>
          ) : (
            <ul className="space-y-3">
              {[...grouped.entries()].map(([propertyId, screens]) => (
                <li
                  key={propertyId}
                  className="rounded-md border border-border-subtle bg-surface p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-fg">
                        {propertyById.get(propertyId)?.name ?? '—'}
                      </p>
                      <p className="text-xs text-muted">
                        On {screens.length} screen{screens.length === 1 ? '' : 's'}{' '}
                        until{' '}
                        {new Date(
                          screens[0]!.emergency_until!,
                        ).toLocaleTimeString()}
                      </p>
                      <p className="mt-1 text-sm text-fg">
                        “{screens[0]!.emergency_message ?? ''}”
                      </p>
                    </div>
                    <form action={clearEmergencyAction}>
                      <input
                        type="hidden"
                        name="property_id"
                        value={propertyId}
                      />
                      <button
                        type="submit"
                        className="focus-ring rounded-md border border-border-default px-3 py-2 text-sm font-medium text-fg hover:bg-surface-muted"
                      >
                        Clear
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <p className="text-xs text-subtle">
        Looking for a screen?{' '}
        <Link
          href="/signage"
          className="focus-ring rounded-sm font-medium text-fg underline"
        >
          Back to screens
        </Link>
        .
      </p>
    </div>
  )
}
