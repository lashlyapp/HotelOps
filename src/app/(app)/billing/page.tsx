import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { requireSession } from '@/lib/auth/session'
import { BRAND } from '@/lib/brand'
import {
  getStripeCustomerForOrg,
  getSubscriptionsForOrg,
  listStripeInvoices,
  type StripeInvoiceSummary,
} from '@/lib/stripe/subscriptions'
import type {
  BillingSubscription,
  BillingSubscriptionStatus,
  Property,
} from '@/lib/supabase/types'
import { StripeRedirectButton } from './_components/billing-actions'

export default async function BillingPage() {
  const session = await requireSession()
  const [subscriptions, customerId] = await Promise.all([
    getSubscriptionsForOrg(session.organization.id),
    getStripeCustomerForOrg(session.organization.id),
  ])
  const stripeInvoices = customerId ? await listStripeInvoices(customerId) : []
  const isOwner = session.profile.role === 'org_owner'

  // Pair every property with its subscription (or null if it doesn't have
  // one yet). The Billing page is the single org-level view: one row per
  // property, each with its own card / status / "manage" affordance.
  const subsByProperty = new Map<string, BillingSubscription>()
  for (const s of subscriptions) subsByProperty.set(s.property_id, s)
  const rows = session.properties.map((property) => ({
    property,
    subscription: subsByProperty.get(property.id) ?? null,
  }))

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Billing
        </h1>
        <p className="mt-1 text-sm text-muted">
          One subscription per property — each can be paid with a different
          credit card. All subscriptions bill under the same{' '}
          {session.organization.name} customer.
        </p>
      </div>

      {rows.length === 0 ? (
        <NoPropertiesCard />
      ) : (
        <PropertyBillingTable rows={rows} canManage={isOwner} />
      )}

      <StripeInvoicesCard invoices={stripeInvoices} />

      {customerId && isOwner ? (
        <Card>
          <div className="p-5 space-y-3">
            <h2 className="text-sm font-semibold text-fg">
              Customer-level billing
            </h2>
            <p className="text-sm text-muted leading-relaxed">
              View and update your billing email, address, and saved payment
              methods. Per-property card selection is managed in the table
              above.
            </p>
            <div className="pt-1">
              <StripeRedirectButton
                endpoint="/api/stripe/portal"
                variant="secondary"
              >
                Open Stripe billing portal
              </StripeRedirectButton>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

function NoPropertiesCard() {
  return (
    <Card>
      <div className="p-5 space-y-3">
        <h2 className="text-sm font-semibold text-fg">No properties yet</h2>
        <p className="text-sm text-muted leading-relaxed">
          {BRAND.name} bills{' '}
          <strong className="text-fg">$100 / month per property</strong> plus a
          one-time <strong className="text-fg">$250 setup fee</strong> on your
          first property&apos;s invoice. Add your first property from the
          Properties page; each property gets its own subscription with its
          own credit card.
        </p>
      </div>
    </Card>
  )
}

function PropertyBillingTable({
  rows,
  canManage,
}: {
  rows: { property: Property; subscription: BillingSubscription | null }[]
  canManage: boolean
}) {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-border-subtle">
        <h2 className="text-sm font-semibold text-fg">
          Property subscriptions
        </h2>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
          <tr>
            <th className="px-4 py-3 font-medium">Property</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Card</th>
            <th className="px-4 py-3 font-medium">Plan</th>
            <th className="px-4 py-3 font-medium">Next renewal</th>
            <th className="px-4 py-3 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map(({ property, subscription }) => (
            <PropertyRow
              key={property.id}
              property={property}
              subscription={subscription}
              canManage={canManage}
            />
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function PropertyRow({
  property,
  subscription,
  canManage,
}: {
  property: Property
  subscription: BillingSubscription | null
  canManage: boolean
}) {
  const hasCard = Boolean(subscription?.default_payment_method_id)
  const daysLeft = daysUntil(subscription?.payment_method_due_at ?? null)
  const needsCard =
    subscription &&
    !hasCard &&
    !['canceled', 'incomplete_expired'].includes(subscription.status)

  return (
    <tr>
      <td className="px-4 py-3 font-medium text-fg">{property.name}</td>
      <td className="px-4 py-3">
        {subscription ? (
          <SubscriptionStatusBadge status={subscription.status} />
        ) : (
          <Badge tone="neutral">Not started</Badge>
        )}
      </td>
      <td className="px-4 py-3 text-muted">
        {hasCard
          ? `${capitalize(subscription?.default_payment_brand)} ending ${subscription?.default_payment_last4 ?? '••••'}`
          : '—'}
      </td>
      <td className="px-4 py-3 text-muted">{formatPlan(subscription)}</td>
      <td className="px-4 py-3 text-muted">
        {subscription?.current_period_end
          ? formatDate(subscription.current_period_end)
          : needsCard && subscription?.payment_method_due_at
            ? `Due in ${daysLeft ?? 0}d`
            : '—'}
      </td>
      <td className="px-4 py-3 text-right">
        {canManage ? (
          !subscription ? (
            <StripeRedirectButton
              endpoint="/api/stripe/setup-checkout"
              body={{ property_id: property.id }}
              size="sm"
            >
              Start &amp; add card
            </StripeRedirectButton>
          ) : !hasCard ? (
            <StripeRedirectButton
              endpoint="/api/stripe/setup-checkout"
              body={{ property_id: property.id }}
              size="sm"
            >
              Add card
            </StripeRedirectButton>
          ) : (
            <StripeRedirectButton
              endpoint="/api/stripe/setup-checkout"
              body={{ property_id: property.id }}
              variant="secondary"
              size="sm"
            >
              Change card
            </StripeRedirectButton>
          )
        ) : null}
      </td>
    </tr>
  )
}

function StripeInvoicesCard({ invoices }: { invoices: StripeInvoiceSummary[] }) {
  if (invoices.length === 0) {
    return (
      <Card>
        <div className="p-5 space-y-1">
          <h2 className="text-sm font-semibold text-fg">Invoices</h2>
          <p className="text-sm text-muted">No invoices yet.</p>
        </div>
      </Card>
    )
  }
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-border-subtle">
        <h2 className="text-sm font-semibold text-fg">Invoices</h2>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
          <tr>
            <th className="px-4 py-3 font-medium">Number</th>
            <th className="px-4 py-3 font-medium">Issued</th>
            <th className="px-4 py-3 font-medium">Due</th>
            <th className="px-4 py-3 font-medium">Amount</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td className="px-4 py-3 font-mono text-xs text-fg">
                {invoice.number ?? '—'}
              </td>
              <td className="px-4 py-3 text-muted">
                {formatDate(invoice.created_at)}
              </td>
              <td className="px-4 py-3 text-muted">
                {invoice.due_at ? formatDate(invoice.due_at) : '—'}
              </td>
              <td className="px-4 py-3 font-medium text-fg tabular-nums">
                {formatMoney(invoice.amount_due_cents, invoice.currency)}
              </td>
              <td className="px-4 py-3">
                <StripeInvoiceStatusBadge status={invoice.status} />
              </td>
              <td className="px-4 py-3 text-right">
                {invoice.hosted_url ? (
                  <a
                    href={invoice.hosted_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline text-xs"
                  >
                    View
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function SubscriptionStatusBadge({
  status,
}: {
  status: BillingSubscriptionStatus
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
  const label = status.replace(/_/g, ' ')
  return <Badge tone={tone}>{label}</Badge>
}

function StripeInvoiceStatusBadge({
  status,
}: {
  status: StripeInvoiceSummary['status']
}) {
  const tone: BadgeProps['tone'] =
    status === 'paid'
      ? 'success'
      : status === 'open'
        ? 'warning'
        : status === 'uncollectible' || status === 'void'
          ? 'danger'
          : 'neutral'
  return <Badge tone={tone}>{status ?? 'unknown'}</Badge>
}

function formatPlan(s: BillingSubscription | null): string {
  if (!s || s.unit_amount_cents == null) return '—'
  return `${formatMoney(s.unit_amount_cents, s.currency)}/mo`
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (currency || 'USD').toUpperCase(),
  }).format(cents / 100)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

function capitalize(s: string | null | undefined): string {
  if (!s) return 'Card'
  return s.charAt(0).toUpperCase() + s.slice(1)
}
