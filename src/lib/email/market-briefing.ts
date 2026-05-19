import 'server-only'
import { BRAND } from '@/lib/brand'
import { getEmailFrom, getResend } from '@/lib/email/client'
import type {
  DailyMarketBriefing,
  PricingRecommendation,
} from '@/lib/supabase/types'

export type MarketBriefingEmailArgs = {
  to: string
  recipientName: string | null
  propertyName: string
  briefing: DailyMarketBriefing
  topRecommendations: PricingRecommendation[]
  marketUrl: string
}

const OUTLOOK_LABEL: Record<DailyMarketBriefing['demand_outlook'], string> = {
  soft: 'Soft demand',
  steady: 'Steady demand',
  strong: 'Strong demand',
  compressed: 'Compressed market',
}

export async function sendMarketBriefingEmail(
  args: MarketBriefingEmailArgs,
): Promise<{ ok: boolean; resendId?: string }> {
  const resend = getResend()
  if (!resend) {
    console.warn(
      `[market-briefing] RESEND_API_KEY not set; skipping email to ${args.to}`,
    )
    return { ok: false }
  }

  const { subject, text, html } = renderMarketBriefingEmail(args)

  try {
    const { data, error } = await resend.emails.send({
      from: getEmailFrom(),
      to: args.to,
      subject,
      text,
      html,
    })
    if (error) {
      console.error('[market-briefing] resend error', error)
      return { ok: false }
    }
    return { ok: true, resendId: data?.id }
  } catch (err) {
    console.error('[market-briefing] resend threw', err)
    return { ok: false }
  }
}

// Pure renderer — returns subject + plain text + HTML without
// sending anything. Exported so the platform-admin preview page
// can show the exact markup the GM will receive.
export function renderMarketBriefingEmail(args: MarketBriefingEmailArgs): {
  subject: string
  text: string
  html: string
} {
  const greeting = args.recipientName
    ? `Good morning, ${args.recipientName.split(' ')[0]}.`
    : 'Good morning.'
  const date = new Date(args.briefing.briefing_date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const subject = subjectFor(args.briefing, args.propertyName)
  const outlook = OUTLOOK_LABEL[args.briefing.demand_outlook]

  const recsText = args.topRecommendations.length === 0
    ? '— Nothing flagged today.'
    : args.topRecommendations.map((r) => `• ${r.headline}`).join('\n')

  const text = [
    greeting,
    '',
    `${args.propertyName} — ${date}`,
    `${outlook} · ${args.briefing.opportunity_count} opportunities · ${args.briefing.alert_count} alerts`,
    '',
    args.briefing.headline,
    '',
    args.briefing.body,
    '',
    'Top opportunities:',
    recsText,
    '',
    `Open full briefing: ${args.marketUrl}`,
    '',
    `— ${BRAND.name}`,
  ].join('\n')

  const recsHtml = args.topRecommendations.length === 0
    ? `<p style="color:#57534e">Nothing flagged today.</p>`
    : `<ul style="padding-left:18px;margin:0">${args.topRecommendations
        .map((r) => `<li style="margin:4px 0">${escapeHtml(r.headline)}</li>`)
        .join('')}</ul>`

  const html = wrap(`
    <p>${escapeHtml(greeting)}</p>
    <h2 style="margin:24px 0 4px;font-size:18px;line-height:1.3">${escapeHtml(args.propertyName)} — ${escapeHtml(date)}</h2>
    <p style="color:#57534e;margin:0 0 16px">${escapeHtml(outlook)} · ${args.briefing.opportunity_count} opportunities · ${args.briefing.alert_count} alerts</p>
    <p style="font-size:16px;font-weight:600;margin:16px 0">${escapeHtml(args.briefing.headline)}</p>
    <div style="color:#1c1917;white-space:pre-wrap;margin:16px 0">${escapeHtml(args.briefing.body)}</div>
    <h3 style="margin:24px 0 8px;font-size:14px">Top opportunities</h3>
    ${recsHtml}
    <p style="margin:24px 0">${ctaButton(args.marketUrl, 'Open full briefing →')}</p>
    <p style="color:#a8a29e;font-size:12px;margin-top:32px">
      You receive this each morning because you're an owner on ${escapeHtml(BRAND.name)}.
      Manage alerts on your account page.
    </p>
  `)

  return { subject, text, html }
}

function subjectFor(briefing: DailyMarketBriefing, propertyName: string): string {
  if (briefing.demand_outlook === 'compressed') {
    return `${propertyName} — comp set compressing. Pricing opportunity.`
  }
  if (briefing.demand_outlook === 'strong') {
    return `${propertyName} — strong demand window forming.`
  }
  if (briefing.opportunity_count >= 3) {
    return `${propertyName} — ${briefing.opportunity_count} pricing opportunities today.`
  }
  if (briefing.alert_count > 0) {
    return `${propertyName} — ${briefing.alert_count} market alert${briefing.alert_count === 1 ? '' : 's'} to review.`
  }
  return `${propertyName} — today's market briefing.`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function wrap(inner: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#1c1917;font-size:14px;line-height:1.6">
      ${inner.trim()}
    </div>
  `.trim()
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500">${escapeHtml(label)}</a>`
}
