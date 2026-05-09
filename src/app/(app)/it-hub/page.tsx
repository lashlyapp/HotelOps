import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ItEquipment,
  ItNetwork,
  ItVendor,
} from '@/lib/supabase/types'
import { NETWORK_TYPE_LABELS, VENDOR_TYPE_LABELS } from './_lib/labels'

export default async function ItHubOverviewPage() {
  const session = await requireOrgUser()
  const orgId = session.organization.id

  const admin = createAdminClient()
  const [{ data: networks }, { data: credentials }, { data: equipment }, { data: vendors }] =
    await Promise.all([
      admin.from('it_networks').select('*').eq('org_id', orgId),
      admin.from('it_credentials').select('*').eq('org_id', orgId),
      admin.from('it_equipment').select('*').eq('org_id', orgId),
      admin
        .from('it_vendors')
        .select('*')
        .eq('org_id', orgId)
        .order('is_emergency', { ascending: false })
        .order('name', { ascending: true }),
    ])

  const guestNetworks = ((networks ?? []) as ItNetwork[]).filter(
    (n) => n.network_type === 'guest' || n.is_shareable,
  )
  const emergencyVendors = ((vendors ?? []) as ItVendor[]).filter(
    (v) => v.is_emergency,
  )
  const allVendors = (vendors ?? []) as ItVendor[]
  const brokenCount = ((equipment ?? []) as ItEquipment[]).filter(
    (e) => e.status === 'broken',
  ).length

  return (
    <div className="p-8 space-y-6">
      <section
        aria-label="At a glance"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <KpiTile
          label="Wi-Fi networks"
          value={(networks ?? []).length}
          href="/it-hub/wifi"
        />
        <KpiTile
          label="Saved logins"
          value={(credentials ?? []).length}
          href="/it-hub/logins"
        />
        <KpiTile
          label="Equipment"
          value={(equipment ?? []).length}
          hint={brokenCount > 0 ? `${brokenCount} flagged broken` : undefined}
          tone={brokenCount > 0 ? 'warning' : 'neutral'}
          href="/it-hub/equipment"
        />
        <KpiTile
          label="Vendors"
          value={allVendors.length}
          hint={
            emergencyVendors.length > 0
              ? `${emergencyVendors.length} emergency`
              : undefined
          }
          href="/it-hub/vendors"
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Need help right now?</CardTitle>
            <Link
              href="/it-hub/vendors"
              className="focus-ring rounded-sm text-xs font-medium text-muted hover:text-fg"
            >
              All contacts →
            </Link>
          </CardHeader>
          <CardBody className="p-0">
            {emergencyVendors.length === 0 ? (
              <div className="p-5 text-sm text-muted">
                <p>
                  No emergency contacts saved yet. When the Wi-Fi goes down at
                  9pm on a Saturday, you’ll be glad you added one.
                </p>
                <Link
                  href="/it-hub/vendors"
                  className="focus-ring mt-3 inline-block rounded-sm text-sm font-medium text-fg underline"
                >
                  Add your first contact →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {emergencyVendors.map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-fg truncate">
                          {v.name}
                        </p>
                        <Badge tone="danger">24/7</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-subtle">
                        {VENDOR_TYPE_LABELS[v.vendor_type]}
                        {v.contact_name ? ` · ${v.contact_name}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end text-sm">
                      {v.phone ? (
                        <a
                          href={`tel:${v.phone}`}
                          className="focus-ring rounded-sm font-medium text-fg hover:underline"
                        >
                          {v.phone}
                        </a>
                      ) : null}
                      {v.email ? (
                        <a
                          href={`mailto:${v.email}`}
                          className="focus-ring rounded-sm text-xs text-muted hover:underline"
                        >
                          {v.email}
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Guest Wi-Fi</CardTitle>
            <Link
              href="/it-hub/wifi"
              className="focus-ring rounded-sm text-xs font-medium text-muted hover:text-fg"
            >
              Manage →
            </Link>
          </CardHeader>
          <CardBody>
            {guestNetworks.length === 0 ? (
              <p className="text-sm text-muted">
                No guest networks saved yet. Add one so the front desk can read
                it off in seconds.
              </p>
            ) : (
              <ul className="space-y-3 text-sm">
                {guestNetworks.slice(0, 3).map((n) => (
                  <li key={n.id} className="rounded-md border border-border-subtle p-3">
                    <p className="text-xs uppercase tracking-wider text-subtle">
                      {NETWORK_TYPE_LABELS[n.network_type]}
                    </p>
                    <p className="mt-0.5 font-medium text-fg">{n.label}</p>
                    {n.ssid ? (
                      <p className="mt-1 text-xs text-muted">
                        Network:{' '}
                        <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono">
                          {n.ssid}
                        </code>
                      </p>
                    ) : null}
                    {n.password ? (
                      <p className="mt-1 text-xs text-muted">
                        Password:{' '}
                        <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono">
                          {n.password}
                        </code>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink
            href="/it-hub/wifi"
            title="Wi-Fi networks"
            blurb="Guest, staff, BOH, and event Wi-Fi with SSIDs and passwords."
          />
          <QuickLink
            href="/it-hub/logins"
            title="Vendor logins"
            blurb="One spot for PMS, OTA, social, accounting, and utility logins."
          />
          <QuickLink
            href="/it-hub/equipment"
            title="Equipment list"
            blurb="TVs, routers, printers, cameras — what you have and where it lives."
          />
          <QuickLink
            href="/it-hub/vendors"
            title="Vendors &amp; contacts"
            blurb="ISP, IT support, software vendors. Mark anyone you can call after-hours."
          />
        </CardBody>
      </Card>
    </div>
  )
}

function KpiTile({
  label,
  value,
  hint,
  href,
  tone = 'neutral',
}: {
  label: string
  value: number
  hint?: string
  href: string
  tone?: 'neutral' | 'warning'
}) {
  return (
    <Link
      href={href}
      className="focus-ring block rounded-lg border border-border-subtle bg-surface p-4 shadow-xs hover:bg-surface-muted"
    >
      <p className="text-xs uppercase tracking-wider text-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-fg tabular-nums">
        {value}
      </p>
      {hint ? (
        <p
          className={
            tone === 'warning'
              ? 'mt-0.5 text-xs text-warning-fg'
              : 'mt-0.5 text-xs text-muted'
          }
        >
          {hint}
        </p>
      ) : null}
    </Link>
  )
}

function QuickLink({
  href,
  title,
  blurb,
}: {
  href: string
  title: string
  blurb: string
}) {
  return (
    <Link
      href={href}
      className="focus-ring block rounded-md border border-border-subtle p-4 hover:bg-surface-muted"
    >
      <p className="text-sm font-semibold text-fg">{title}</p>
      <p className="mt-1 text-xs text-muted">{blurb}</p>
    </Link>
  )
}
