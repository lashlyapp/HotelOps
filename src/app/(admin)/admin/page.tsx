import Link from 'next/link'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { requirePlatformAdmin } from '@/lib/auth/session'
import { computeTrialState, type TrialState } from '@/lib/billing/trial'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BillingSubscriptionStatus } from '@/lib/supabase/types'

type TenantRow = {
  id: string
  name: string
  slug: string
  created_at: string
  property_count: number
  owner_email: string | null
  billing_status: BillingSubscriptionStatus | null
  has_card: boolean
  mrr_cents: number
  trial: TrialState
  trial_converted_at: string | null
}

type TrialStats = {
  active: number
  expiringSoon: number // ends within 3 days
  expired: number     // past expiry, never converted
  converted: number
  newLast7d: number
}

export default async function AdminDashboardPage() {
  await requirePlatformAdmin()
  const tenants = await loadTenants()
  const stats = computeTrialStats(tenants)

  // Sort: trials expiring soon first, then active trials, then paid, then
  // converted/expired. Within each bucket, newest first. Gives the admin
  // an action-prioritized list at the top.
  const sorted = [...tenants].sort((a, b) => bucketRank(a) - bucketRank(b))

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Platform admin
          </h1>
          <p className="mt-1 text-sm text-muted">
            {tenants.length === 0
              ? 'No tenants yet.'
              : `${tenants.length} organization${tenants.length === 1 ? '' : 's'} on the platform.`}
          </p>
        </div>
        <Link
          href="/admin/tenants/new"
          className="focus-ring inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover transition-colors"
        >
          Create tenant
        </Link>
      </div>

      <TrialStatsRow stats={stats} />

      <Card className="overflow-hidden">
        <div className="border-b border-border-subtle bg-surface-muted px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">Tenants</h2>
          <p className="mt-0.5 text-xs text-muted">
            Sorted by attention required — trials expiring soon at the top.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Properties</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">MRR</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-sm text-muted"
                  >
                    Click <strong className="text-fg">Create tenant</strong> to add the first one, or wait for the first self-serve signup to roll in.
                  </td>
                </tr>
              ) : (
                sorted.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-surface-muted transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-fg">
                      <Link
                        href={`/admin/tenants/${t.id}`}
                        className="focus-ring rounded-sm hover:underline"
                      >
                        {t.name}
                      </Link>
                      <p className="text-xs text-subtle font-mono">{t.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-muted">{t.owner_email ?? '—'}</td>
                    <td className="px-4 py-3 text-fg tabular-nums">{t.property_count}</td>
                    <td className="px-4 py-3">
                      <PlanCell tenant={t} />
                    </td>
                    <td className="px-4 py-3 text-fg tabular-nums">
                      {t.mrr_cents > 0 ? formatMoney(t.mrr_cents) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {new Date(t.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function TrialStatsRow({ stats }: { stats: TrialStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Stat label="Active trials" value={stats.active} tone="info" />
      <Stat
        label="Expiring in ≤3d"
        value={stats.expiringSoon}
        tone={stats.expiringSoon > 0 ? 'warning' : 'neutral'}
      />
      <Stat
        label="Expired, no card"
        value={stats.expired}
        tone={stats.expired > 0 ? 'danger' : 'neutral'}
      />
      <Stat label="Converted" value={stats.converted} tone="success" />
      <Stat label="New in last 7d" value={stats.newLast7d} tone="neutral" />
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'info' | 'warning' | 'danger' | 'success' | 'neutral'
}) {
  const toneCls =
    tone === 'info'
      ? 'text-info-fg'
      : tone === 'warning'
        ? 'text-warning-fg'
        : tone === 'danger'
          ? 'text-danger-fg'
          : tone === 'success'
            ? 'text-success-fg'
            : 'text-fg'
  return (
    <Card>
      <div className="px-4 py-3">
        <p className="text-xs uppercase tracking-wider text-subtle">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>
          {value}
        </p>
      </div>
    </Card>
  )
}

function PlanCell({ tenant }: { tenant: TenantRow }) {
  // Paid > Trial > Expired. The billing-mirror status takes precedence
  // when present so we don't mislabel a paying tenant as "trial".
  if (tenant.billing_status) {
    return <BillingBadge status={tenant.billing_status} hasCard={tenant.has_card} />
  }
  if (tenant.trial.kind === 'active') {
    return (
      <div className="flex items-center gap-1.5">
        <Badge tone="info">trial</Badge>
        <span className="text-xs text-muted">
          {tenant.trial.daysLeft}d left
        </span>
      </div>
    )
  }
  if (tenant.trial.kind === 'expired') {
    return (
      <div className="flex items-center gap-1.5">
        <Badge tone="danger">trial expired</Badge>
        <span className="text-xs text-muted">no card</span>
      </div>
    )
  }
  return <span className="text-xs text-subtle">no plan</span>
}

function BillingBadge({
  status,
  hasCard,
}: {
  status: BillingSubscriptionStatus
  hasCard: boolean
}) {
  const tone: BadgeProps['tone'] =
    status === 'active'
      ? 'success'
      : status === 'trialing'
        ? 'info'
        : status === 'past_due' || status === 'unpaid' || status === 'paused'
          ? 'warning'
          : status === 'canceled' || status === 'incomplete_expired'
            ? 'danger'
            : 'neutral'
  return (
    <div className="flex items-center gap-1.5">
      <Badge tone={tone}>{status.replace(/_/g, ' ')}</Badge>
      {!hasCard ? (
        <span className="text-xs text-warning-fg" title="No card on file">
          no card
        </span>
      ) : null}
    </div>
  )
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

function computeTrialStats(tenants: TenantRow[]): TrialStats {
  const stats: TrialStats = {
    active: 0,
    expiringSoon: 0,
    expired: 0,
    converted: 0,
    newLast7d: 0,
  }
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  for (const t of tenants) {
    if (new Date(t.created_at).getTime() > sevenDaysAgo) stats.newLast7d += 1
    if (t.trial_converted_at) stats.converted += 1
    // A tenant counts as "active trial" only when no paid sub exists yet.
    if (!t.billing_status && t.trial.kind === 'active') {
      stats.active += 1
      if (t.trial.daysLeft <= 3) stats.expiringSoon += 1
    } else if (!t.billing_status && t.trial.kind === 'expired') {
      stats.expired += 1
    }
  }
  return stats
}

/**
 * Sort buckets — lower rank surfaces first. The intent is "what does the
 * admin need to look at?": expiring trials → expired trials → active
 * trials → paying customers in trouble → healthy customers.
 */
function bucketRank(t: TenantRow): number {
  if (!t.billing_status && t.trial.kind === 'active' && t.trial.daysLeft <= 3) {
    return 0
  }
  if (!t.billing_status && t.trial.kind === 'expired') return 1
  if (!t.billing_status && t.trial.kind === 'active') return 2
  if (
    t.billing_status === 'past_due' ||
    t.billing_status === 'unpaid' ||
    t.billing_status === 'paused'
  ) {
    return 3
  }
  if (
    t.billing_status === 'canceled' ||
    t.billing_status === 'incomplete_expired'
  ) {
    return 4
  }
  return 5
}

async function loadTenants(): Promise<TenantRow[]> {
  const admin = createAdminClient()
  const { data: orgs, error } = await admin
    .from('organizations')
    .select(
      'id, name, slug, created_at, trial_started_at, trial_ends_at, trial_converted_at',
    )
    .order('created_at', { ascending: false })
  if (error) throw error

  const orgIds = (orgs ?? []).map((o) => o.id)
  if (orgIds.length === 0) return []

  const [{ data: properties }, { data: ownerProfiles }, { data: subs }] =
    await Promise.all([
      admin.from('properties').select('org_id').in('org_id', orgIds),
      admin
        .from('profiles')
        .select('id, org_id, role')
        .in('org_id', orgIds)
        .eq('role', 'org_owner'),
      admin
        .from('billing_subscriptions')
        .select(
          'org_id, status, default_payment_method_id, unit_amount_cents, quantity',
        )
        .in('org_id', orgIds),
    ])

  const propertyCounts = new Map<string, number>()
  for (const p of properties ?? []) {
    propertyCounts.set(p.org_id, (propertyCounts.get(p.org_id) ?? 0) + 1)
  }

  const STATUS_RANK: Record<BillingSubscriptionStatus, number> = {
    incomplete_expired: 6,
    canceled: 5,
    paused: 4,
    unpaid: 3,
    past_due: 2,
    incomplete: 1,
    trialing: 0,
    active: 0,
  }
  const billingByOrg = new Map<
    string,
    {
      status: BillingSubscriptionStatus
      has_card: boolean
      mrr_cents: number
    }
  >()
  for (const s of subs ?? []) {
    const status = s.status as BillingSubscriptionStatus
    const mrr = (s.unit_amount_cents ?? 0) * (s.quantity ?? 1)
    const hasCard = Boolean(s.default_payment_method_id)
    const prev = billingByOrg.get(s.org_id)
    if (!prev) {
      billingByOrg.set(s.org_id, {
        status,
        has_card: hasCard,
        mrr_cents: mrr,
      })
    } else {
      billingByOrg.set(s.org_id, {
        status:
          STATUS_RANK[status] > STATUS_RANK[prev.status] ? status : prev.status,
        has_card: prev.has_card && hasCard,
        mrr_cents: prev.mrr_cents + mrr,
      })
    }
  }

  const ownerEmails = new Map<string, string>()
  if ((ownerProfiles ?? []).length > 0) {
    const { data: users } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    })
    const byId = new Map<string, string>()
    for (const u of users?.users ?? []) {
      if (u.email) byId.set(u.id, u.email)
    }
    for (const profile of ownerProfiles ?? []) {
      const email = byId.get(profile.id)
      if (email && profile.org_id) ownerEmails.set(profile.org_id, email)
    }
  }

  return (orgs ?? []).map((o) => {
    const billing = billingByOrg.get(o.id)
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      created_at: o.created_at,
      property_count: propertyCounts.get(o.id) ?? 0,
      owner_email: ownerEmails.get(o.id) ?? null,
      billing_status: billing?.status ?? null,
      has_card: billing?.has_card ?? false,
      mrr_cents: billing?.mrr_cents ?? 0,
      trial: computeTrialState(o.trial_ends_at),
      trial_converted_at: o.trial_converted_at,
    }
  })
}
