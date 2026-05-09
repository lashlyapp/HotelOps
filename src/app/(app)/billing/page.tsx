import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { requireSession } from '@/lib/auth/session'
import { BRAND, BRAND_ADDRESS_LINES } from '@/lib/brand'
import { getSubscriptionForOrg } from '@/lib/stripe/subscriptions'
import { createClient } from '@/lib/supabase/server'
import type { BillingSubscription, BillingSubscriptionStatus, Invoice } from '@/lib/supabase/types'
import { StripeRedirectButton } from './_components/billing-actions'

export default async function BillingPage() {
  const session = await requireSession()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('org_id', session.organization.id)
    .order('period_end', { ascending: false })

  if (error) throw error
  const invoices = (data ?? []) as Invoice[]
  const subscription = await getSubscriptionForOrg(session.organization.id)
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

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle">
          <h2 className="text-sm font-semibold text-fg">Invoices</h2>
          <p className="text-xs text-muted mt-0.5">
            Past invoices billed by check.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
            <tr>
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Due</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {invoices.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-sm text-muted"
                >
                  No invoices yet.
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-4 py-3 text-fg">
                    {formatDate(invoice.period_start)} —{' '}
                    {formatDate(invoice.period_end)}
                  </td>
                  <td className="px-4 py-3 font-medium text-fg tabular-nums">
                    {formatMoney(invoice.amount_cents, invoice.currency)}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {invoice.due_date ? formatDate(invoice.due_date) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <InvoiceStatusBadge status={invoice.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Card>
        <div className="p-5 space-y-2">
          <h2 className="text-sm font-semibold text-fg">Mailing instructions</h2>
          <p className="text-sm text-muted">
            Make checks payable to <span className="text-fg font-medium">{BRAND.legalName}</span>.
            Mail to:
          </p>
          <address className="not-italic text-sm text-muted leading-6">
            {BRAND_ADDRESS_LINES.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </address>
        </div>
      </Card>
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
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-fg">Subscription</h2>
            <Badge tone="neutral">Not started</Badge>
          </div>
          <p className="text-sm text-muted">
            Your subscription hasn&apos;t been activated yet. Reach out to{' '}
            <a
              className="text-primary hover:underline"
              href={`mailto:${BRAND.supportEmail}`}
            >
              {BRAND.supportEmail}
            </a>{' '}
            and we&apos;ll get you set up.
          </p>
        </div>
      </Card>
    )
  }

  const hasCard = Boolean(subscription.default_payment_method_id)
  const trialDaysLeft = daysUntil(subscription.trial_end)
  const renewsOn = subscription.current_period_end

  return (
    <Card>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-fg">Subscription</h2>
          <SubscriptionStatusBadge status={subscription.status} />
        </div>

        {subscription.status === 'trialing' && trialDaysLeft !== null ? (
          <p className="text-sm text-muted">
            You&apos;re in your{' '}
            <span className="text-fg font-medium">
              14-day onboarding period
            </span>
            .{' '}
            {trialDaysLeft > 0
              ? `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} remaining`
              : 'Ends today'}
            {subscription.trial_end
              ? ` (ends ${formatDate(subscription.trial_end)})`
              : ''}
            . Add a payment method before then to keep service running without
            interruption.
          </p>
        ) : null}

        {subscription.status === 'past_due' || subscription.status === 'unpaid' ? (
          <p className="text-sm text-danger-fg">
            Payment failed. Update your card to restore service.
          </p>
        ) : null}

        {subscription.status === 'paused' ? (
          <p className="text-sm text-warning-fg">
            Subscription is paused because no card was on file when the trial
            ended. Add a payment method to resume.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border-subtle">
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
              {subscription.status === 'trialing' ? 'First charge' : 'Renews'}
            </p>
            <p className="mt-1 text-sm text-fg">
              {subscription.status === 'trialing'
                ? subscription.trial_end
                  ? formatDate(subscription.trial_end)
                  : '—'
                : renewsOn
                  ? formatDate(renewsOn)
                  : '—'}
            </p>
          </div>
        </div>

        {canManage ? (
          <div className="pt-2 flex flex-wrap gap-3">
            {!hasCard ? (
              <StripeRedirectButton endpoint="/api/stripe/setup-checkout">
                Add payment method
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

function InvoiceStatusBadge({ status }: { status: Invoice['status'] }) {
  const tone: BadgeProps['tone'] =
    status === 'paid' ? 'success' : status === 'pending' ? 'warning' : 'neutral'
  return <Badge tone={tone}>{status}</Badge>
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
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
