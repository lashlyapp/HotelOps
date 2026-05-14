import Link from 'next/link'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgOwner } from '@/lib/auth/session'
import { listMediaForPropertyCached } from '@/lib/r2/list'
import { computeLibraryStats, formatBytes } from '@/lib/r2/stats'
import { r2PublicUrl } from '@/lib/r2/client'
import { stripe } from '@/lib/stripe/client'
import {
  HOTELOPS_PRICE_LOOKUP_KEYS,
  resolvePriceSnapshotByLookupKey,
  type PriceSnapshot,
} from '@/lib/stripe/prices'
import { AddPropertyForm } from './_components/add-property-form'
import { RemovePropertyButton } from './_components/remove-property-button'

export default async function PropertiesPage() {
  const session = await requireOrgOwner()
  // Pricing is per-property, so adding a property is the trigger for
  // starting the Stripe subscription. We swap the Add Property form
  // for a billing CTA when no sub is on file.
  const subscriptionRequired = session.gate.status === 'no_subscription'

  const stripeClient = stripe()
  const [rows, monthlyPrice, setupFeePrice] = await Promise.all([
    Promise.all(
      session.properties.map(async (p) => {
        const files = await listMediaForPropertyCached(p.id, p.r2_prefix)
        return { property: p, stats: computeLibraryStats(files) }
      }),
    ),
    subscriptionRequired
      ? resolvePriceSnapshotByLookupKey(
          stripeClient,
          HOTELOPS_PRICE_LOOKUP_KEYS.perPropertyMonthly,
        )
      : Promise.resolve(null),
    subscriptionRequired
      ? resolvePriceSnapshotByLookupKey(
          stripeClient,
          HOTELOPS_PRICE_LOOKUP_KEYS.setupFee,
        )
      : Promise.resolve(null),
  ])

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Properties
        </h1>
        <p className="mt-1 text-sm text-muted">
          Each property has its own media catalog and details. Click a property
          to edit its address, logo, and contact info.
        </p>
      </div>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-border-subtle">
          {rows.length === 0 ? (
            <li className="p-8 text-center text-sm text-muted">
              No properties yet.{' '}
              {subscriptionRequired
                ? 'Start your subscription below to add the first one.'
                : 'Add the first one below.'}
            </li>
          ) : (
            rows.map(({ property, stats }) => (
              <li
                key={property.id}
                className="flex items-center gap-4 p-4 hover:bg-surface-muted transition-colors"
              >
                <PropertyAvatar
                  name={property.name}
                  logoKey={property.logo_key}
                  logoUploadedAt={property.logo_uploaded_at}
                />

                <Link
                  href={`/properties/${property.id}`}
                  className="focus-ring rounded-sm flex-1 min-w-0"
                >
                  <p className="text-sm font-medium text-fg truncate">
                    {property.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted truncate">
                    {formatLocation(property) ?? 'No address yet'}
                  </p>
                </Link>

                <div className="hidden sm:block text-right">
                  <p className="text-xs text-subtle uppercase tracking-wider">
                    Library
                  </p>
                  <p className="text-sm text-fg tabular-nums">
                    {stats.fileCount} · {formatBytes(stats.totalBytes)}
                  </p>
                </div>

                <RemovePropertyButton propertyId={property.id} />
              </li>
            ))
          )}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {subscriptionRequired
              ? 'Start subscription to add your first property'
              : 'Add property'}
          </CardTitle>
        </CardHeader>
        <CardBody>
          {subscriptionRequired ? (
            <div className="space-y-3">
              <p className="text-sm text-muted leading-relaxed">
                Pricing is per property:{' '}
                <strong className="text-fg">
                  {formatRecurringPrice(monthlyPrice)}
                </strong>{' '}
                per property plus a one-time{' '}
                <strong className="text-fg">
                  {formatOneTimePrice(setupFeePrice)} setup fee
                </strong>{' '}
                charged on each property&apos;s first invoice. We&apos;ll add
                your card and your first property in one step.
              </p>
              <Link
                href="/billing"
                className="focus-ring inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover transition-colors"
              >
                Go to billing →
              </Link>
            </div>
          ) : (
            <AddPropertyForm />
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function PropertyAvatar({
  name,
  logoKey,
  logoUploadedAt,
}: {
  name: string
  logoKey: string | null
  logoUploadedAt: string | null
}) {
  if (logoKey) {
    const cacheBust = logoUploadedAt
      ? `?t=${new Date(logoUploadedAt).getTime()}`
      : ''
    return (
      <div className="size-12 shrink-0 rounded-md overflow-hidden border border-border-subtle bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${r2PublicUrl(logoKey)}${cacheBust}`}
          alt={`${name} logo`}
          className="size-full object-cover"
        />
      </div>
    )
  }
  const initial = name.charAt(0).toUpperCase()
  return (
    <div className="size-12 shrink-0 rounded-md border border-border-subtle bg-surface-muted flex items-center justify-center text-sm font-semibold text-muted">
      {initial}
    </div>
  )
}

function formatLocation(p: {
  city: string | null
  state: string | null
  country: string
}): string | null {
  const parts = [p.city, p.state].filter(Boolean) as string[]
  if (parts.length === 0) return null
  const main = parts.join(', ')
  return p.country && p.country !== 'US' ? `${main} · ${p.country}` : main
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

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (currency || 'USD').toUpperCase(),
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)
}
