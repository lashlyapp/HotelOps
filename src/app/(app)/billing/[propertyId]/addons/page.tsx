import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { getSubscriptionForProperty } from '@/lib/stripe/subscriptions'
import { AddonToggle } from '../../_components/addon-toggle'

/**
 * Focused page for managing a single property's add-ons. Surfaced from
 * the … menu on the property row in /billing. Lives off the main billing
 * page so the table doesn't have to list every available add-on against
 * every property (which gets cluttered fast as the add-on catalog grows).
 */
export default async function PropertyAddonsPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  const { propertyId } = await params
  const session = await requireOrgUser()
  const property = session.properties.find((p) => p.id === propertyId)
  if (!property) notFound()

  const subscription = await getSubscriptionForProperty(propertyId)
  if (
    !subscription ||
    !subscription.stripe_subscription_id ||
    subscription.status === 'canceled' ||
    subscription.status === 'incomplete_expired'
  ) {
    // No live subscription to attach add-ons to — bounce back to the
    // billing page where they can start one.
    redirect('/billing')
  }

  return (
    <div className="p-4 sm:p-8 space-y-5 max-w-2xl">
      <div>
        <Link
          href="/billing"
          className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
        >
          ← Back to billing
        </Link>
        <h1 className="mt-2 text-lg font-semibold tracking-tight text-fg">
          Manage add-ons
        </h1>
        <p className="mt-1 text-sm text-muted">
          {property.name} · billed alongside the base subscription on this
          property&rsquo;s card. Mid-cycle changes are prorated.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available add-ons</CardTitle>
        </CardHeader>
        <CardBody className="divide-y divide-border-subtle">
          <div className="py-3">
            <AddonToggle
              propertyId={property.id}
              addonKey="signage_unlimited"
              label="Signage Unlimited"
              priceCents={4900}
              active={subscription.signage_unlimited_active}
            />
            <p className="mt-1 text-xs text-muted">
              Unlimited TV screens at this property. The first 3 screens
              are included in the base subscription; the add-on lifts the
              cap.
            </p>
          </div>
          <div className="py-3">
            <AddonToggle
              propertyId={property.id}
              addonKey="guest_experience"
              label="Guest Experience"
              priceCents={3900}
              active={subscription.guest_experience_active}
            />
            <p className="mt-1 text-xs text-muted">
              Arrival pages, printable QR cards, and guest room-issue
              intake. Beats per-room concierge tools on TCO for any
              property over ~10 rooms.
            </p>
          </div>
        </CardBody>
      </Card>

      <p className="text-xs text-subtle">
        Looking for pricing details? See the{' '}
        <a
          href="/billing"
          className="focus-ring rounded-sm underline hover:text-fg"
        >
          billing page
        </a>{' '}
        — add-ons stack on the per-property line item on each invoice.
      </p>
    </div>
  )
}
