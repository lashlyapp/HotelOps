import { NextResponse, type NextRequest } from 'next/server'
import { sendMarketBriefingEmail } from '@/lib/email/market-briefing'
import { verifyCronAuth } from '@/lib/market/sources/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  DailyMarketBriefing,
  PricingRecommendation,
} from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Sends the daily market briefing email to each org_owner whose
// organization has not opted out. One email per (property, briefing
// day); dedupe via briefing_email_log.

export async function GET(request: NextRequest) {
  const auth = verifyCronAuth(request)
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  // Pull today's briefings + their property + their org_owner emails.
  const { data: briefings, error } = await admin
    .from('daily_market_briefings')
    .select(`
      *,
      properties:property_id (id, name, org_id, slug),
      organizations:org_id (id, name, slug, market_briefing_email_opt_out)
    `)
    .eq('briefing_date', today)
    .limit(2000)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const briefingRow of (briefings as Array<DailyMarketBriefing & {
    properties: { id: string; name: string; org_id: string; slug: string } | { id: string; name: string; org_id: string; slug: string }[] | null
    organizations: { id: string; market_briefing_email_opt_out: boolean } | { id: string; market_briefing_email_opt_out: boolean }[] | null
  }> | null) ?? []) {
    const property = Array.isArray(briefingRow.properties)
      ? briefingRow.properties[0]
      : briefingRow.properties
    const org = Array.isArray(briefingRow.organizations)
      ? briefingRow.organizations[0]
      : briefingRow.organizations
    if (!property || !org) {
      skipped++
      continue
    }
    if (org.market_briefing_email_opt_out) {
      skipped++
      continue
    }

    // Dedupe — don't double-send.
    const { data: existing } = await admin
      .from('briefing_email_log')
      .select('id')
      .eq('property_id', property.id)
      .eq('briefing_date', today)
      .maybeSingle()
    if (existing) {
      skipped++
      continue
    }

    // Find the org_owner profile + email.
    const { data: owner } = await admin
      .from('profiles')
      .select('id, full_name')
      .eq('org_id', property.org_id)
      .eq('role', 'org_owner')
      .limit(1)
      .maybeSingle<{ id: string; full_name: string | null }>()
    if (!owner) {
      skipped++
      continue
    }
    const { data: ownerUser } = await admin.auth.admin.getUserById(owner.id)
    const recipientEmail = ownerUser?.user?.email
    if (!recipientEmail) {
      skipped++
      continue
    }

    // Pull top recommendations.
    const { data: recs } = await admin
      .from('pricing_recommendations')
      .select('*')
      .eq('property_id', property.id)
      .is('acted_at', null)
      .order('priority', { ascending: false })
      .order('target_date', { ascending: true })
      .limit(3)

    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.myhotelops.com'
    ).replace(/\/+$/, '')
    const marketUrl = `${siteUrl}/market?property=${property.slug}`

    const result = await sendMarketBriefingEmail({
      to: recipientEmail,
      recipientName: owner.full_name,
      propertyName: property.name,
      briefing: briefingRow,
      topRecommendations: (recs as PricingRecommendation[] | null) ?? [],
      marketUrl,
    })

    if (result.ok) {
      await admin.from('briefing_email_log').insert({
        property_id: property.id,
        org_id: property.org_id,
        briefing_date: today,
        recipient_email: recipientEmail,
        resend_id: result.resendId ?? null,
      })
      sent++
    } else {
      errors.push(`${property.id}: send failed`)
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, errors: errors.length, sample: errors.slice(0, 5) })
}
