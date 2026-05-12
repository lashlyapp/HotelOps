import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { requireSession } from '@/lib/auth/session'
import { BRAND } from '@/lib/brand'
import {
  getSubscriptionForOrg,
  listStripeInvoices,
  type StripeInvoiceSummary,
} from '@/lib/stripe/subscriptions'
import type {
  BillingSubscription,
  BillingSubscriptionStatus,
} from '@/lib/supabase/types'
import { StripeRedirectButton } from './_components/billing-actions'

export default async function BillingPage() {
  const session = await requireSession()
  const subscription = await getSubscriptionForOrg(session.organization.id)
  const stripeInvoices = subscription?.stripe_customer_id
    ? await listStripeInvoices(subscription.stripe_customer_id)
    : []
  const isOwner = session.profile.role === 'org_owner'

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Billing
        </h1>
        <p className="mt-1 text-sm text-muted">
          Subscription and payment method for {session.organization.name}.
        </p>
      </div>

      <SubscriptionCard subscription={subscription} canManage={isOwner} />

      <StripeInvoicesCard invoices={stripeInvoices} />
    </div>
  )
}

function SubscriptionCard({
  subscription,
  canManage,
}: {
  subscription: BillingSubscription | null
  canManage: boolean
}) {
  if (!subscription) {
    return (
      <Card>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-fg">Subscription</h2>
            <Badge tone="neutral">Not started</Badge>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            You haven&apos;t started a subscription yet. {BRAND.name} is{' '}
            <strong className="text-fg">$100 / month per property</strong>{' '}
            plus a one-time{' '}
            <strong className="text-fg">$250 setup fee</strong> on the first
            invoice. Cancel anytime from this page.
          </p>
          <p className="text-sm text-muted leading-relaxed">
            Click below to enter a card and add your first property. Your
            subscription quantity automatically adjusts whenever you add or
            remove a property.
          </p>
          {canManage ? (
            <div className="pt-1">
              <StripeRedirectButton endpoint="/api/stripe/setup-checkout">
                Start subscription &amp; add card
              </StripeRedirectButton>
            </div>
          ) : (
            <p className="text-sm text-subtle">
              Ask the account owner to start the subscription from this page.
            </p>
          )}
        </div>
      </Card>
    )
  }

  const hasCard = Boolean(subscription.default_payment_method_id)
  const daysLeft = daysUntil(subscription.payment_method_due_at)

  return (
    <Card>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-fg">Subscription</h2>
          <SubscriptionStatusBadge status={subscription.status} />
        </div>

        {!hasCard ? (
          <div className="rounded-md border border-warning-bg bg-warning-bg px-4 py-3 text-sm text-warning-fg">
            <p className="font-medium">
              Save a payment method for auto-renewal
            </p>
            <p className="mt-1">
              Your subscription is active. Add a credit card so future monthly
              invoices charge automatically.
              {subscription.payment_method_due_at && daysLeft !== null
                ? ` You have ${daysLeft} day${daysLeft === 1 ? '' : 's'} (until ${formatDate(subscription.payment_method_due_at)}) before the first invoice goes past due.`
                : ''}
            </p>
          </div>
        ) : null}

        {subscription.status === 'past_due' || subscription.status === 'unpaid' ? (
          <p className="text-sm text-danger-fg">
            Payment failed on the most recent charge. Update your card to
            restore auto-renewal.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3 pt-2 border-t border-border-subtle">
          <div>
            <p className="text-xs uppercase tracking-wider text-subtle">Plan</p>
            <p className="mt-1 text-sm text-fg">
              {formatPlan(subscription)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-subtle">
              Payment method
            </p>
            <p className="mt-1 text-sm text-fg">
              {hasCard
                ? `${capitalize(subscription.default_payment_brand)} ending ${subscription.default_payment_last4 ?? '••••'}`
                : 'None on file'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-subtle">
              {subscription.current_period_end ? 'Next renewal' : 'First invoice'}
            </p>
            <p className="mt-1 text-sm text-fg">
              {subscription.current_period_end
                ? formatDate(subscription.current_period_end)
                : '—'}
            </p>
          </div>
        </div>

        {canManage ? (
          <div className="pt-2 flex flex-wrap gap-3">
            {!hasCard ? (
              <StripeRedirectButton endpoint="/api/stripe/setup-checkout">
                Save card for auto-renewal
              </StripeRedirectButton>
            ) : (
              <StripeRedirectButton
                endpoint="/api/stripe/portal"
                variant="secondary"
              >
                Manage billing
              </StripeRedirectButton>
            )}
          </div>
        ) : (
          <p className="text-xs text-subtle">
            Only an organization owner can update the payment method.
          </p>
        )}
      </div>
    </Card>
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

function formatPlan(s: BillingSubscription): string {
  if (s.unit_amount_cents == null) return '—'
  const per = formatMoney(s.unit_amount_cents, s.currency)
  if (s.quantity <= 1) return `${per}/mo`
  const total = formatMoney(s.unit_amount_cents * s.quantity, s.currency)
  return `${per} × ${s.quantity} properties = ${total}/mo`
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
