import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { allPostsIncludingScheduled } from '@/content/blog'
import {
  sendBlogPostPublishedNotification,
  sendBlogQueueEmptyNotification,
} from '@/lib/email/send'
import { BRAND } from '@/lib/brand'

/**
 * Vercel Cron: daily blog drip-publish maintenance.
 *
 * Runs once a day (see vercel.json). On every run:
 *
 *   1. Find any post whose publishedAt is today (UTC). For each one,
 *      send the founder a "post went live" notification.
 *   2. Revalidate /sitemap.xml so search engines pick up the freshly-
 *      live post within the same hour (the sitemap also has
 *      revalidate=3600 as a safety net for off-cron rebuilds).
 *   3. If no future-dated posts remain in the registry, send a
 *      "queue empty" warning so the founder can write the next draft
 *      before the 14-day cadence breaks.
 *
 * Idempotency: we de-dupe within a single day's UTC window. Vercel
 * crons can fire twice in degenerate cases (deploy rollover); the
 * notification emails are cheap and rare enough that we accept the
 * risk of a duplicate without storing a per-post "notified_at" row.
 *
 * Auth: same `Authorization: Bearer ${CRON_SECRET}` convention used
 * by /api/cron/billing-reconcile, trial-expiry, etc.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PUBLISH_CADENCE_DAYS = 14

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not set' },
      { status: 500 },
    )
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 },
    )
  }

  const todayIso = new Date().toISOString().slice(0, 10)
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? `https://www.${BRAND.domain}`
  ).replace(/\/+$/, '')

  // 1. Posts that just went live today.
  const newlyLive = allPostsIncludingScheduled.filter(
    (p) => p.publishedAt === todayIso,
  )

  const notified: string[] = []
  for (const post of newlyLive) {
    const ok = await sendBlogPostPublishedNotification({
      to: BRAND.supportEmail,
      postTitle: post.title,
      postSlug: post.slug,
      postUrl: `${siteUrl}/blog/${post.slug}`,
    })
    if (ok) notified.push(post.slug)
  }

  // 2. Force the sitemap to revalidate so the new posts hit search
  // engines within the hour, regardless of organic request traffic.
  if (newlyLive.length > 0) {
    revalidatePath('/sitemap.xml')
    revalidatePath('/blog')
  }

  // 3. Queue health: if no posts are scheduled for any future date,
  // nudge the founder to write the next one.
  const futurePosts = allPostsIncludingScheduled.filter(
    (p) => p.publishedAt > todayIso,
  )
  const publishedPosts = allPostsIncludingScheduled.filter(
    (p) => p.publishedAt <= todayIso,
  )
  let queueWarned = false
  if (futurePosts.length === 0) {
    const latestPublishedAt = publishedPosts[0]?.publishedAt ?? null
    const baseline = latestPublishedAt
      ? new Date(`${latestPublishedAt}T00:00:00Z`)
      : new Date(`${todayIso}T00:00:00Z`)
    const nextDate = new Date(
      baseline.getTime() + PUBLISH_CADENCE_DAYS * 24 * 60 * 60 * 1000,
    )
    const nextSuggestedDate = nextDate.toISOString().slice(0, 10)
    queueWarned = await sendBlogQueueEmptyNotification({
      to: BRAND.supportEmail,
      latestPublishedAt,
      nextSuggestedDate,
    })
  }

  return NextResponse.json({
    ok: true,
    today: todayIso,
    newlyLive: newlyLive.map((p) => p.slug),
    notified,
    futureQueueSize: futurePosts.length,
    queueWarned,
  })
}
