import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardBody } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import {
  loadMarketBundleForToday,
  refreshMarketIntelligence,
} from '@/lib/market/refresh'
import { BriefingCard } from './_components/briefing-card'
import { CompetitorList } from './_components/competitor-list'
import { DemandList } from './_components/demand-list'
import { PropertyTabs } from './_components/property-tabs'
import { RecommendationsList } from './_components/recommendations-list'
import { RefreshForm } from './_components/refresh-form'

type SearchParams = Promise<{ property?: string }>

export default async function MarketPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await requireOrgUser()
  const { property: propertySlug } = await searchParams

  if (session.properties.length === 0) {
    return (
      <div className="p-4 sm:p-8 max-w-3xl">
        <PageHeader title="Revenue intelligence" />
        <p className="mt-4 text-sm text-muted">
          Add a property to start receiving market insights.
        </p>
      </div>
    )
  }

  const activeProperty =
    session.properties.find((p) => p.slug === propertySlug) ??
    session.properties[0]
  if (propertySlug !== activeProperty.slug) {
    redirect(`/market?property=${activeProperty.slug}`)
  }

  const today = new Date().toISOString().slice(0, 10)

  // First-touch generation: if today's briefing is missing for this
  // property, derive everything on the fly so the GM never sees an
  // empty state on day one. Subsequent visits hit the cached rows.
  let bundle = await loadMarketBundleForToday(activeProperty, today)
  if (!bundle) {
    bundle = await refreshMarketIntelligence(
      activeProperty,
      session.organization,
      { today },
    )
  }

  const currencyCode = session.organization.currency.toUpperCase()

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Revenue intelligence
          </h1>
          <p className="mt-1 text-sm text-muted max-w-2xl">
            What your property should pay attention to today — demand
            shifts, competitor movement, and pricing opportunities.
            Detected automatically. No comp-set configuration required.
          </p>
        </div>
        <RefreshForm propertyId={activeProperty.id} />
      </div>

      <PropertyTabs
        properties={session.properties.map((p) => ({
          slug: p.slug,
          name: p.name,
          active: p.slug === activeProperty.slug,
        }))}
      />

      <BriefingCard
        briefing={bundle.briefing}
        propertyName={activeProperty.name}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecommendationsList recommendations={bundle.recommendations} />
        <DemandList signals={bundle.signals} />
      </div>

      <CompetitorList
        competitors={bundle.competitors}
        currencyCode={currencyCode}
      />

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-fg">
              {bundle.profile.market_segment.charAt(0).toUpperCase() +
                bundle.profile.market_segment.slice(1)}{' '}
              · Tier {bundle.profile.tier}
              {bundle.profile.location_descriptor
                ? ` · ${bundle.profile.location_descriptor}`
                : ''}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {bundle.profile.operator_confirmed
                ? 'Profile confirmed by operator. Intelligence anchors on these inputs.'
                : 'Profile auto-detected. Edit the segment, ADR band, or location if it looks off.'}
            </p>
          </div>
          <Link
            href={`/market/settings?property=${activeProperty.slug}`}
            className="focus-ring rounded-sm text-sm font-medium text-fg underline-offset-2 hover:underline"
          >
            Adjust market profile →
          </Link>
        </CardBody>
      </Card>
    </div>
  )
}

function PageHeader({ title }: { title: string }) {
  return (
    <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
  )
}
