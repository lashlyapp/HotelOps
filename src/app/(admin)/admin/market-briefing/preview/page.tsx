import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requirePlatformAdmin } from '@/lib/auth/session'
import { renderMarketBriefingEmail } from '@/lib/email/market-briefing'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  DailyMarketBriefing,
  PricingRecommendation,
} from '@/lib/supabase/types'

type SearchParams = Promise<{ property?: string }>

// Platform-admin preview of the daily morning email. Lets us
// eyeball tomorrow's send without waiting for the cron.

export default async function MarketBriefingPreviewPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requirePlatformAdmin()
  const { property: requestedProperty } = await searchParams

  const today = new Date().toISOString().slice(0, 10)
  const admin = createAdminClient()

  // List all properties that have a briefing today.
  const { data: briefingRows } = await admin
    .from('daily_market_briefings')
    .select(`
      *,
      properties:property_id (id, name, slug, org_id),
      organizations:org_id (id, name, market_briefing_email_opt_out)
    `)
    .eq('briefing_date', today)
    .order('created_at', { ascending: false })
    .limit(200)

  type Row = DailyMarketBriefing & {
    properties: { id: string; name: string; slug: string; org_id: string } | null
    organizations: { id: string; name: string; market_briefing_email_opt_out: boolean } | null
  }
  const briefings = ((briefingRows as unknown as Row[]) ?? [])
    .filter((b) => b.properties && b.organizations)

  const selected =
    briefings.find((b) => b.properties?.slug === requestedProperty) ??
    briefings[0] ??
    null

  // Compose preview for the selected property.
  let previewHtml: string | null = null
  let previewMeta: {
    recipientEmail: string | null
    optedOut: boolean
    alreadySent: boolean
    recommendations: PricingRecommendation[]
  } = {
    recipientEmail: null,
    optedOut: false,
    alreadySent: false,
    recommendations: [],
  }

  if (selected?.properties && selected?.organizations) {
    const optedOut = selected.organizations.market_briefing_email_opt_out
    const { data: existing } = await admin
      .from('briefing_email_log')
      .select('id')
      .eq('property_id', selected.properties.id)
      .eq('briefing_date', today)
      .maybeSingle()
    const alreadySent = Boolean(existing)

    const { data: owner } = await admin
      .from('profiles')
      .select('id, full_name')
      .eq('org_id', selected.properties.org_id)
      .eq('role', 'org_owner')
      .limit(1)
      .maybeSingle<{ id: string; full_name: string | null }>()
    let recipientEmail: string | null = null
    let recipientName: string | null = null
    if (owner) {
      recipientName = owner.full_name
      const { data: ownerUser } = await admin.auth.admin.getUserById(owner.id)
      recipientEmail = ownerUser?.user?.email ?? null
    }

    const { data: recs } = await admin
      .from('pricing_recommendations')
      .select('*')
      .eq('property_id', selected.properties.id)
      .is('acted_at', null)
      .order('priority', { ascending: false })
      .order('target_date', { ascending: true })
      .limit(3)
    const recommendations = (recs as PricingRecommendation[] | null) ?? []

    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.myhotelops.com'
    ).replace(/\/+$/, '')
    previewHtml = renderMarketBriefingEmail({
      to: recipientEmail ?? '<no owner email>',
      recipientName,
      propertyName: selected.properties.name,
      briefing: selected,
      topRecommendations: recommendations,
      marketUrl: `${siteUrl}/market?property=${selected.properties.slug}`,
    }).html

    previewMeta = { recipientEmail, optedOut, alreadySent, recommendations }
  }

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Daily briefing email — preview
        </h1>
        <p className="mt-1 text-sm text-muted max-w-2xl">
          Preview the morning email exactly as the GM will see it. The
          cron sends one email per (property, day) at 13:00 UTC; rows
          flagged below as &quot;already sent&quot; have been delivered.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s briefings ({briefings.length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {briefings.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">
              No briefings generated for today yet. They&apos;re produced on
              first /market visit or via the build cron.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {briefings.map((b) => (
                <li
                  key={b.id}
                  className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3 ${
                    selected?.id === b.id ? 'bg-surface-muted' : ''
                  }`}
                >
                  <div>
                    <Link
                      href={`/admin/market-briefing/preview?property=${b.properties?.slug}`}
                      className="focus-ring rounded-sm text-sm font-medium text-fg hover:underline"
                    >
                      {b.properties?.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">
                      {b.organizations?.name} · {b.demand_outlook} · {b.opportunity_count} opp · {b.alert_count} alert
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {b.organizations?.market_briefing_email_opt_out ? (
                      <Badge tone="neutral">opted out</Badge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {selected ? (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>{selected.properties?.name} — email preview</CardTitle>
            <span className="text-xs text-subtle">
              {previewMeta.recipientEmail ?? '(no owner email on file)'}
            </span>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {previewMeta.optedOut ? (
                <Badge tone="warning">org opted out — will NOT be sent</Badge>
              ) : (
                <Badge tone="success">will be sent</Badge>
              )}
              {previewMeta.alreadySent ? (
                <Badge tone="info">already sent today</Badge>
              ) : (
                <Badge tone="neutral">not yet sent</Badge>
              )}
              <span className="text-subtle">
                {previewMeta.recommendations.length} top recommendation
                {previewMeta.recommendations.length === 1 ? '' : 's'} included
              </span>
            </div>

            {previewHtml ? (
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                className="h-[640px] w-full rounded-md border border-border-subtle bg-white"
              />
            ) : (
              <p className="text-sm text-muted">No preview available.</p>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
