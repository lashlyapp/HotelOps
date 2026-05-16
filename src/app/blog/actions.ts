'use server'

import { headers } from 'next/headers'
import { BRAND } from '@/lib/brand'
import {
  sendGuideLeadEmail,
  sendGuideLeadNotification,
} from '@/lib/email/send'
import { getLocale } from '@/lib/i18n/get-locale'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Lead-magnet form action for gated content downloads (currently
 * the boutique-modernization PDF guide). The flow:
 *
 *   1. Visitor submits the form (name, email, hotel, optional website).
 *   2. We rate-limit by IP (8 submissions / 15 minutes) — same window
 *      as the other public forms on the marketing site.
 *   3. Persist the lead in `guide_leads` for sales follow-up + analytics.
 *   4. Fire two emails in parallel — one to the lead with the download
 *      link, one to the founder inbox.
 *   5. Return the download URL so the client can render an instant
 *      success state. We do not gate the actual file behind a token;
 *      the URL is the same one the email links to, which keeps the
 *      flow simple and means the lead can re-download later by
 *      re-submitting the form.
 *
 * Reuses the conventions of /demo and /signup: server action returns
 * a plain object the client renders, no redirects, all validation
 * messages keyed off the i18n dictionary.
 */

export type GuideRequestResult = {
  error?: string
  /** Set when the submission succeeded. The client swaps to the
   *  success state and shows the download CTA. */
  success?: { downloadUrl: string }
}

export type GuideSlug = '10-ways-modernize-boutique-hotel'

type GuideDescriptor = {
  slug: GuideSlug
  title: string
}

const GUIDES: Record<GuideSlug, GuideDescriptor> = {
  '10-ways-modernize-boutique-hotel': {
    slug: '10-ways-modernize-boutique-hotel',
    title: '10 ways to modernize your boutique hotel',
  },
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RATE_WINDOW_MINUTES = 15
const RATE_LIMIT_PER_IP = 8

export async function requestGuideDownload(
  _prev: GuideRequestResult,
  formData: FormData,
): Promise<GuideRequestResult> {
  const slug = String(formData.get('guide_slug') ?? '').trim() as GuideSlug
  const guide = GUIDES[slug]
  if (!guide) {
    return { error: 'Unknown guide.' }
  }

  // Honeypot — bots fill every input including hidden ones, humans
  // can't see this field. Silently succeed-but-do-nothing so the
  // bot doesn't learn to retry with the field cleared. We do NOT
  // insert a lead or send emails in this branch.
  const honeypot = String(formData.get('company_size') ?? '').trim()
  if (honeypot) {
    console.warn('[guide] honeypot tripped; dropping submission')
    return { success: { downloadUrl: '' } }
  }

  const visitorName = String(formData.get('name') ?? '').trim()
  const visitorEmail = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const hotelName = String(formData.get('hotel_name') ?? '').trim()
  const website = String(formData.get('website') ?? '').trim() || null

  if (!visitorName || !visitorEmail || !hotelName) {
    return { error: 'Name, email, and hotel name are required.' }
  }
  if (!EMAIL_RE.test(visitorEmail)) {
    return { error: 'Please enter a valid email address.' }
  }
  if (visitorName.length > 200 || hotelName.length > 200) {
    return { error: 'Names should stay under 200 characters.' }
  }
  if (website && website.length > 400) {
    return { error: 'Website URL is too long.' }
  }

  const locale = await getLocale()
  const ipAddress = await getClientIp()
  const userAgent = (await headers()).get('user-agent') ?? null
  const admin = createAdminClient()

  if (ipAddress) {
    const since = new Date(
      Date.now() - RATE_WINDOW_MINUTES * 60 * 1000,
    ).toISOString()
    const { count } = await admin
      .from('guide_leads')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ipAddress)
      .gte('created_at', since)
    if ((count ?? 0) >= RATE_LIMIT_PER_IP) {
      return {
        error: `Too many submissions from this network. Try again in a few minutes, or email ${BRAND.supportEmail}.`,
      }
    }
  }

  // UTM snapshot (best-effort; the cookie may not be set for organic
  // traffic and that is fine).
  let utm: {
    utm_source: string | null
    utm_medium: string | null
    utm_campaign: string | null
  } = { utm_source: null, utm_medium: null, utm_campaign: null }
  try {
    const cookieHeader = (await headers()).get('cookie')
    if (cookieHeader) {
      const match = cookieHeader
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('utm_attribution='))
      if (match) {
        const raw = decodeURIComponent(match.split('=').slice(1).join('='))
        const parsed = JSON.parse(raw) as Record<string, string>
        utm = {
          utm_source: parsed.utm_source ?? null,
          utm_medium: parsed.utm_medium ?? null,
          utm_campaign: parsed.utm_campaign ?? null,
        }
      }
    }
  } catch {
    // ignore malformed cookie
  }

  const { data: inserted, error: insertErr } = await admin
    .from('guide_leads')
    .insert({
      email: visitorEmail,
      visitor_name: visitorName,
      hotel_name: hotelName,
      website,
      guide_slug: guide.slug,
      visitor_locale: locale,
      ip_address: ipAddress,
      user_agent: userAgent,
      ...utm,
    })
    .select('download_token')
    .single()

  if (insertErr || !inserted) {
    console.error('[guide] insert failed', insertErr)
    return {
      error: `Something went wrong saving your request. Please email ${BRAND.supportEmail} and we'll send it manually.`,
    }
  }

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? `https://www.${BRAND.domain}`
  ).replace(/\/+$/, '')
  const downloadUrl = `${siteUrl}/api/blog/guide-download?t=${inserted.download_token}`

  // Fire both emails in parallel; we don't block the success
  // response on either of them. The lead has the download URL
  // either way (the success state shows it instantly).
  Promise.all([
    sendGuideLeadEmail({
      to: visitorEmail,
      recipientName: visitorName,
      guideTitle: guide.title,
      downloadUrl,
    }).catch((err) => {
      console.error('[guide] lead email failed', err)
      return false
    }),
    sendGuideLeadNotification({
      to: BRAND.supportEmail,
      visitorName,
      visitorEmail,
      hotelName,
      website,
      guideTitle: guide.title,
      guideSlug: guide.slug,
      visitorLocale: locale,
    }).catch((err) => {
      console.error('[guide] notification email failed', err)
      return false
    }),
  ])

  return { success: { downloadUrl } }
}

async function getClientIp(): Promise<string | null> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return h.get('x-real-ip')
}
