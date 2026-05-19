import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { detectAndStoreMarketProfile } from '@/lib/market/profile'
import { PropertyTabs } from '../_components/property-tabs'
import { PreferencesForm } from './_components/preferences-form'
import { ProfileForm } from './_components/profile-form'

type SearchParams = Promise<{ property?: string }>

export default async function MarketSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await requireOrgUser()
  const { property: propertySlug } = await searchParams

  if (session.properties.length === 0) {
    return (
      <div className="p-4 sm:p-8 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Market profile
        </h1>
        <p className="mt-2 text-sm text-muted">
          Add a property to configure its market profile.
        </p>
      </div>
    )
  }

  const activeProperty =
    session.properties.find((p) => p.slug === propertySlug) ??
    session.properties[0]
  if (propertySlug !== activeProperty.slug) {
    redirect(`/market/settings?property=${activeProperty.slug}`)
  }

  // Ensure the row exists so the form renders the auto-detected
  // defaults on first visit (rather than blanks the GM has to type).
  const profile = await detectAndStoreMarketProfile(activeProperty)

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Market profile
          </h1>
          <p className="mt-1 text-sm text-muted max-w-2xl">
            The platform auto-detected this property&apos;s positioning.
            Adjust anything that looks off — your changes are treated
            as ground truth and re-derive the briefing immediately.
          </p>
        </div>
        <Link
          href={`/market?property=${activeProperty.slug}`}
          className="focus-ring rounded-sm text-sm font-medium text-muted hover:text-fg"
        >
          ← Back to insights
        </Link>
      </div>

      <PropertyTabs
        basePath="/market/settings"
        properties={session.properties.map((p) => ({
          slug: p.slug,
          name: p.name,
          active: p.slug === activeProperty.slug,
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Org-wide preferences</CardTitle>
        </CardHeader>
        <CardBody>
          <PreferencesForm
            peerAdrOptIn={session.organization.peer_adr_opt_in}
            marketBriefingEmailOptOut={session.organization.market_briefing_email_opt_out}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{activeProperty.name}</CardTitle>
        </CardHeader>
        <CardBody>
          <ProfileForm
            propertyId={activeProperty.id}
            currencyCode={session.organization.currency.toUpperCase()}
            initial={{
              market_segment: profile.market_segment,
              tier: profile.tier,
              adr_floor: profile.adr_floor,
              adr_ceiling: profile.adr_ceiling,
              location_descriptor: profile.location_descriptor,
              amenity_tags: profile.amenity_tags,
              tripadvisor_url: profile.tripadvisor_url,
            }}
          />
        </CardBody>
      </Card>
    </div>
  )
}
