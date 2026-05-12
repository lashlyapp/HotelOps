import Link from 'next/link'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { requirePlatformAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  BillingSubscriptionStatus,
  TenantSignupRequest,
} from '@/lib/supabase/types'
import { SignupRowActions } from './_components/signup-row-actions'

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
}

export default async function AdminDashboardPage() {
  await requirePlatformAdmin()
  const [tenants, pendingSignups] = await Promise.all([
    loadTenants(),
    loadPendingSignups(),
  ])

  return (
    <div className="p-8 space-y-6">
      {pendingSignups.length > 0 ? (
        <PendingSignupsCard signups={pendingSignups} />
      ) : null}

      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Tenants
          </h1>
          <p className="mt-1 text-sm text-muted">
            {tenants.length === 0
              ? 'No tenants yet.'
              : `${tenants.length} active organization${tenants.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        <Link
          href="/admin/tenants/new"
          className="focus-ring inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover transition-colors"
        >
          Create tenant
        </Link>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Properties</th>
              <th className="px-4 py-3 font-medium">Billing</th>
              <th className="px-4 py-3 font-medium">MRR</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {tenants.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm text-muted"
                >
                  Click <strong className="text-fg">Create tenant</strong> to add the first one.
                </td>
              </tr>
            ) : (
              tenants.map((t) => (
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
                  </td>
                  <td className="px-4 py-3 text-muted font-mono text-xs">{t.slug}</td>
                  <td className="px-4 py-3 text-muted">{t.owner_email ?? '—'}</td>
                  <td className="px-4 py-3 text-fg tabular-nums">{t.property_count}</td>
                  <td className="px-4 py-3">
                    <BillingCell status={t.billing_status} hasCard={t.has_card} />
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
      </Card>
    </div>
  )
}

function PendingSignupsCard({ signups }: { signups: PendingSignup[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border-subtle bg-warning-bg/40 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">
            Pending signups
          </h2>
          <p className="text-xs text-muted">
            {signups.length} request{signups.length === 1 ? '' : 's'} waiting
            for review. Approve to provision the tenant; reject to dismiss.
          </p>
        </div>
        <Badge tone="warning">{signups.length}</Badge>
      </div>
      <ul className="divide-y divide-border-subtle">
        {signups.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-start justify-between gap-4 px-5 py-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-fg truncate">
                  {s.hotel_name}
                </p>
                {s.emailCollision ? (
                  <Badge tone="danger">email already in use</Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-muted truncate">
                {s.full_name} ·{' '}
                <a
                  href={`mailto:${s.email}`}
                  className="hover:underline"
                >
                  {s.email}
                </a>
                {s.phone ? (
                  <>
                    {' '}
                    · <span>{s.phone}</span>
                  </>
                ) : null}
              </p>
              {s.message ? (
                <p className="mt-2 text-xs text-muted whitespace-pre-wrap border-l-2 border-border-subtle pl-3">
                  {s.message}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-subtle">
                Submitted{' '}
                {new Date(s.created_at).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <SignupRowActions
              signupId={s.id}
              hotelName={s.hotel_name}
              emailCollision={s.emailCollision}
            />
          </li>
        ))}
      </ul>
    </Card>
  )
}

type PendingSignup = TenantSignupRequest & { emailCollision: boolean }

async function loadPendingSignups(): Promise<PendingSignup[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tenant_signup_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  const signups = (data ?? []) as TenantSignupRequest[]
  if (signups.length === 0) return []

  // Compute email-collision flag for each pending signup so the UI can
  // warn / disable Approve when the email already has an auth user. The
  // server-side approve action enforces this guard too — this is just
  // making the surprise visible before the admin clicks.
  const existingEmails = await listAuthEmails()
  return signups.map((s) => ({
    ...s,
    emailCollision: existingEmails.has(s.email.toLowerCase()),
  }))
}

async function listAuthEmails(): Promise<Set<string>> {
  const admin = createAdminClient()
  const emails = new Set<string>()
  // listUsers is paginated; v1 assumes <200 users which is plenty.
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  for (const u of data?.users ?? []) {
    if (u.email) emails.add(u.email.toLowerCase())
  }
  return emails
}

function BillingCell({
  status,
  hasCard,
}: {
  status: BillingSubscriptionStatus | null
  hasCard: boolean
}) {
  if (!status) return <span className="text-xs text-subtle">none</span>
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

async function loadTenants(): Promise<TenantRow[]> {
  const admin = createAdminClient()
  const { data: orgs, error } = await admin
    .from('organizations')
    .select('id, name, slug, created_at')
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

  const billingByOrg = new Map<
    string,
    {
      status: BillingSubscriptionStatus
      has_card: boolean
      mrr_cents: number
    }
  >()
  for (const s of subs ?? []) {
    billingByOrg.set(s.org_id, {
      status: s.status as BillingSubscriptionStatus,
      has_card: Boolean(s.default_payment_method_id),
      mrr_cents: (s.unit_amount_cents ?? 0) * (s.quantity ?? 1),
    })
  }

  const ownerIds = (ownerProfiles ?? []).map((p) => p.id)
  const ownerEmails = new Map<string, string>()
  if (ownerIds.length > 0) {
    // listUsers is paginated; for v1 we assume <200 users which is plenty.
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
    }
  })
}
