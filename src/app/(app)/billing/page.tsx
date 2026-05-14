import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { requireSession } from '@/lib/auth/session'
import { BRAND } from '@/lib/brand'
import { stripe } from '@/lib/stripe/client'
import {
  HOTELOPS_PRICE_LOOKUP_KEYS,
  resolvePriceSnapshotByLookupKey,
  type PriceSnapshot,
} from '@/lib/stripe/prices'
import {
  getBillingDetails,
  getOrgAutopayDefaultPaymentMethod,
  getStripeCustomerForOrg,
  getSubscriptionsForOrg,
  listOrgPaymentMethods,
  listStripeInvoices,
  type SavedCard,
  type StripeInvoiceSummary,
} from '@/lib/stripe/subscriptions'
import type {
  BillingSubscription,
  BillingSubscriptionStatus,
  Profile,
  Property,
} from '@/lib/supabase/types'
import { StripeRedirectButton } from './_components/billing-actions'
import { AddonToggle } from './_components/addon-toggle'
import { BillingDetailsForm } from './_components/billing-details-form'
import { PropertyCardManager } from './_components/property-card-manager'
import { ResubscribeButton } from './_components/resubscribe-button'
import { ResyncButton } from './_components/resync-button'

export default async function BillingPage() {
  const session = await requireSession()
  const stripeClient = stripe()
  const [
    subscriptions,
    customerId,
    savedCards,
    autopayDefaultPmId,
    monthlyPrice,
    setupFeePrice,
  ] = await Promise.all([
    getSubscriptionsForOrg(session.organization.id),
    getStripeCustomerForOrg(session.organization.id),
    listOrgPaymentMethods(session.organization.id),
    getOrgAutopayDefaultPaymentMethod(session.organization.id),
    resolvePriceSnapshotByLookupKey(
      stripeClient,
      HOTELOPS_PRICE_LOOKUP_KEYS.perPropertyMonthly,
    ),
    resolvePriceSnapshotByLookupKey(
      stripeClient,
      HOTELOPS_PRICE_LOOKUP_KEYS.setupFee,
    ),
  ])
  const [stripeInvoices, billingDetails] = await Promise.all([
    customerId ? listStripeInvoices(customerId) : Promise.resolve([]),
    customerId ? getBillingDetails(customerId) : Promise.resolve(null),
  ])
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
    <div className="p-4 sm:p-8 space-y-6">
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

      <OrganizationCard
        orgName={session.organization.name}
        role={session.profile.role}
        properties={session.properties}
      />

      {rows.length === 0 ? (
        <NoPropertiesCard
          monthlyPrice={monthlyPrice}
          setupFeePrice={setupFeePrice}
        />
      ) : (
        <PropertyBillingTable
          rows={rows}
          canManage={isOwner}
          savedCards={savedCards}
          autopayDefaultPmId={autopayDefaultPmId}
        />
      )}

      <StripeInvoicesCard
        invoices={stripeInvoices}
        propertyBySubscriptionId={propertyBySubscriptionId(rows)}
      />

      {customerId && isOwner && billingDetails ? (
        <Card>
          <div className="p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-fg">
                Billing contact &amp; address
              </h2>
              <p className="text-sm text-muted leading-relaxed">
                Where invoices, receipts, and payment-failure notices are
                sent, and the address printed on every invoice. Per-property
                card selection is managed in the table above.
              </p>
            </div>
            <BillingDetailsForm details={billingDetails} />
          </div>
        </Card>
      ) : null}
    </div>
  )
}

function OrganizationCard({
  orgName,
  role,
  properties,
}: {
  orgName: string
  role: Profile['role']
  properties: Property[]
}) {
  return (
    <Card>
      <div className="p-5 space-y-3">
        <h2 className="text-sm font-semibold text-fg">Organization</h2>
        <dl className="space-y-2">
          <OrgRow label="Name">{orgName}</OrgRow>
          <OrgRow label="Your role">
            <span className="capitalize">{role.replace('_', ' ')}</span>
          </OrgRow>
          <OrgRow label="Properties">
            {properties.length === 0
              ? '—'
              : properties.map((p) => p.name).join(', ')}
          </OrgRow>
        </dl>
      </div>
    </Card>
  )
}

function OrgRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-3 gap-4 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="col-span-2 text-fg">{children}</dd>
    </div>
  )
}

function NoPropertiesCard({
  monthlyPrice,
  setupFeePrice,
}: {
  monthlyPrice: PriceSnapshot | null
  setupFeePrice: PriceSnapshot | null
}) {
  return (
    <Card>
      <div className="p-5 space-y-3">
        <h2 className="text-sm font-semibold text-fg">No properties yet</h2>
        <p className="text-sm text-muted leading-relaxed">
          {BRAND.name} bills{' '}
          <strong className="text-fg">
            {formatRecurringPrice(monthlyPrice)} per property
          </strong>{' '}
          plus a one-time{' '}
          <strong className="text-fg">
            {formatOneTimePrice(setupFeePrice)} setup fee
          </strong>{' '}
          on each property&apos;s first invoice. Add your first property from
          the Properties page; each property gets its own subscription with
          its own credit card.
        </p>
      </div>
    </Card>
  )
}

function formatRecurringPrice(price: PriceSnapshot | null): string {
  if (!price?.unitAmountCents) return 'standard pricing'
  const amount = formatMoney(price.unitAmountCents, price.currency)
  return price.interval ? `${amount} / ${price.interval}` : amount
}

function formatOneTimePrice(price: PriceSnapshot | null): string {
  if (!price?.unitAmountCents) return 'no'
  return formatMoney(price.unitAmountCents, price.currency)
}

function PropertyBillingTable({
  rows,
  canManage,
  savedCards,
  autopayDefaultPmId,
}: {
  rows: { property: Property; subscription: BillingSubscription | null }[]
  canManage: boolean
  savedCards: SavedCard[]
  autopayDefaultPmId: string | null
}) {
  return (
    // The Saved-cards popover uses position:fixed (see property-card-manager)
    // so the outer scroll wrapper here does not clip it.
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border-subtle">
        <h2 className="text-sm font-semibold text-fg">
          Property subscriptions
        </h2>
        {canManage ? <ResyncButton /> : null}
      </div>
      <div className="overflow-x-auto">
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
          {rows.flatMap(({ property, subscription }) => {
            const main = (
              <PropertyRow
                key={property.id}
                property={property}
                subscription={subscription}
                canManage={canManage}
                savedCards={savedCards}
                autopayDefaultPmId={autopayDefaultPmId}
              />
            )
            // Only show the add-on row when the property has a live
            // subscription the operator can attach items to. Pre-start,
            // canceled, and incomplete-expired rows hide the add-on
            // controls — there's nothing for them to bill against.
            if (
              !canManage ||
              !subscription ||
              ['canceled', 'incomplete_expired'].includes(subscription.status)
            ) {
              return [main]
            }
            return [
              main,
              <AddonsRow
                key={`${property.id}-addons`}
                propertyId={property.id}
                subscription={subscription}
              />,
            ]
          })}
        </tbody>
      </table>
      </div>
    </Card>
  )
}

function PropertyRow({
  property,
  subscription,
  canManage,
  savedCards,
  autopayDefaultPmId,
}: {
  property: Property
  subscription: BillingSubscription | null
  canManage: boolean
  savedCards: SavedCard[]
  autopayDefaultPmId: string | null
}) {
  const hasCard = Boolean(subscription?.default_payment_method_id)
  const daysLeft = daysUntil(subscription?.payment_method_due_at ?? null)
  const needsCard =
    subscription &&
    !hasCard &&
    !['canceled', 'incomplete_expired'].includes(subscription.status)
  const isEnded =
    subscription?.status === 'canceled' ||
    subscription?.status === 'incomplete_expired'
  const isScheduledCancel =
    !isEnded && Boolean(subscription?.cancel_at_period_end)

  return (
    <tr>
      <td className="px-4 py-3 font-medium text-fg">{property.name}</td>
      <td className="px-4 py-3">
        {subscription ? (
          <>
            <SubscriptionStatusBadge status={subscription.status} />
            {isScheduledCancel && subscription.current_period_end ? (
              <p className="mt-1 text-xs text-warning-fg">
                Ends {formatDate(subscription.current_period_end)}
              </p>
            ) : null}
          </>
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
          ) : isEnded ? (
            <ResubscribeButton propertyId={property.id} />
          ) : (
            <PropertyCardManager
              propertyId={property.id}
              currentPaymentMethodId={
                subscription.default_payment_method_id ?? null
              }
              currentBrand={subscription.default_payment_brand ?? null}
              currentLast4={subscription.default_payment_last4 ?? null}
              savedCards={savedCards}
              autopayDefaultPmId={autopayDefaultPmId}
              cancelAtPeriodEnd={subscription.cancel_at_period_end}
              currentPeriodEnd={subscription.current_period_end}
            />
          )
        ) : null}
      </td>
    </tr>
  )
}

function StripeInvoicesCard({
  invoices,
  propertyBySubscriptionId,
}: {
  invoices: StripeInvoiceSummary[]
  propertyBySubscriptionId: Map<string, string>
}) {
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
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
          <tr>
            <th className="px-4 py-3 font-medium">Number</th>
            <th className="px-4 py-3 font-medium">Property</th>
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
                {invoicePropertyLabel(invoice, propertyBySubscriptionId)}
              </td>
              <td className="px-4 py-3 text-muted">
                {formatDate(invoice.created_at)}
              </td>
              <td className="px-4 py-3 text-muted">
                {invoice.due_at ? formatDate(invoice.due_at) : '—'}
              </td>
              <td className="px-4 py-3 font-medium text-fg tabular-nums">
                {formatMoney(invoice.amount_due_cents, invoice.currency)}
                {invoice.setup_fee_cents > 0 ? (
                  <p className="mt-0.5 text-xs font-normal text-subtle">
                    Includes{' '}
                    {formatMoney(invoice.setup_fee_cents, invoice.currency)}{' '}
                    setup fee
                  </p>
                ) : null}
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
      </div>
    </Card>
  )
}

function propertyBySubscriptionId(
  rows: { property: Property; subscription: BillingSubscription | null }[],
): Map<string, string> {
  const map = new Map<string, string>()
  for (const { property, subscription } of rows) {
    if (subscription?.stripe_subscription_id) {
      map.set(subscription.stripe_subscription_id, property.name)
    }
  }
  return map
}

function invoicePropertyLabel(
  invoice: StripeInvoiceSummary,
  propertyBySubscriptionId: Map<string, string>,
): string {
  if (!invoice.subscription_id) return '—'
  return (
    propertyBySubscriptionId.get(invoice.subscription_id) ?? 'Deleted property'
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

/**
 * Renders below the property row when the property has an active
 * subscription. Visually nests under its parent — no top border, indented
 * with a left accent rule, compact inline layout — so it reads as "these
 * add-ons belong to the property above" rather than a peer row. See
 * docs/pricing.md.
 */
function AddonsRow({
  propertyId,
  subscription,
}: {
  propertyId: string
  subscription: BillingSubscription
}) {
  return (
    <tr className="!border-t-0">
      <td colSpan={6} className="px-4 pt-0 pb-3">
        <div className="ml-4 border-l-2 border-border-subtle pl-4">
          <p className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-subtle">
            Add-ons
          </p>
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            <AddonToggle
              propertyId={propertyId}
              addonKey="signage_unlimited"
              label="Signage Unlimited"
              priceCents={4900}
              active={subscription.signage_unlimited_active}
            />
            <AddonToggle
              propertyId={propertyId}
              addonKey="guest_experience"
              label="Guest Experience"
              priceCents={3900}
              active={subscription.guest_experience_active}
            />
          </div>
        </div>
      </td>
    </tr>
  )
}
