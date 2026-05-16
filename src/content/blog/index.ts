import * as thirtyDayAudit from './posts/30-day-operational-audit'
import * as arrivalPageDosDonts from './posts/arrival-page-dos-and-donts'
import * as housekeepingHandoff from './posts/boutique-housekeeping-handoff'
import * as eventPipeline from './posts/boutique-hotel-event-pipeline'
import * as emergencyComms from './posts/emergency-communications-plan'
import * as guestConciergeCost from './posts/guest-concierge-app-cost'
import * as guestExpectations from './posts/guest-expectations'
import * as hotelSignageCost from './posts/hotel-digital-signage-cost-2026'
import * as wifiSetup from './posts/hotel-guest-wifi-setup'
import * as signageContent from './posts/hotel-signage-content-that-works'
import * as maintenanceTicket from './posts/maintenance-ticket-that-closes'
import * as modernizeChecklist from './posts/modernize-your-boutique-hotel'
import * as multiPropertyGroup from './posts/multi-property-boutique-group'
import * as gmOnboarding from './posts/onboarding-new-gm-week-one'
import * as operationsBudget from './posts/operations-budget'
import * as ownerMonthlyReport from './posts/owner-monthly-report'
import * as pmsVsOperations from './posts/pms-vs-operations-system'
import * as techModernization from './posts/tech-modernization'
import * as underservedIndustry from './posts/underserved-industry'
import * as whatGuestsNotice from './posts/what-guests-notice-day-one'
import type { BlogPostMeta, BlogPostModule } from './types'

/**
 * Drip-publishing model: posts live in this registry with a
 * `publishedAt` date. Posts whose date is in the future are
 * scheduled — invisible to the index, the sitemap, and the detail
 * page until their date arrives. To queue a new post 14 days after
 * the most recent one, run `npx tsx scripts/schedule-next-post.ts`.
 *
 * Date comparison uses ISO YYYY-MM-DD strings, which sort
 * lexicographically. A post dated 2026-05-15 becomes visible at the
 * first request after UTC midnight on that day. The blog index and
 * detail pages are dynamically rendered (ƒ in the build output) so
 * they pick this up per request; the sitemap revalidates hourly so
 * search engines see new posts within ~60 minutes of go-live.
 */

const MODULES: BlogPostModule[] = [
  // Drip-publish queue — newest scheduled date first. Posts whose
  // publishedAt is in the future are gated by filter() below; the
  // daily cron emails when each one crosses its date.
  thirtyDayAudit, // 2026-11-13
  housekeepingHandoff, // 2026-10-30
  signageContent, // 2026-10-16
  arrivalPageDosDonts, // 2026-10-02
  emergencyComms, // 2026-09-18
  whatGuestsNotice, // 2026-09-04
  ownerMonthlyReport, // 2026-08-21
  gmOnboarding, // 2026-08-07
  eventPipeline, // 2026-07-24
  multiPropertyGroup, // 2026-07-10
  guestConciergeCost, // 2026-06-26
  wifiSetup, // 2026-06-12
  maintenanceTicket, // 2026-05-29
  modernizeChecklist, // 2026-05-15 (live)
  underservedIndustry,
  pmsVsOperations,
  operationsBudget,
  hotelSignageCost,
  techModernization,
  guestExpectations,
]

/** ISO YYYY-MM-DD of today in UTC. Module-scope-stable within a
 *  single request; the page itself is dynamic so each request gets
 *  a fresh evaluation. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function isPublished(meta: BlogPostMeta): boolean {
  return meta.publishedAt <= todayIso()
}

/** Posts visible to the public — newest first, scheduled posts
 *  excluded. Used by the /blog index, sitemap, and related-posts
 *  list on each detail page. */
export const posts: BlogPostMeta[] = MODULES.map((m) => m.meta)
  .filter(isPublished)
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

/** All registered posts including scheduled ones. Used by the
 *  cron-driven queue health check and the schedule-next-post
 *  script — never by user-facing routes. */
export const allPostsIncludingScheduled: BlogPostMeta[] = MODULES.map(
  (m) => m.meta,
).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

export function getPost(slug: string): BlogPostModule | undefined {
  const mod = MODULES.find((m) => m.meta.slug === slug)
  if (!mod) return undefined
  if (!isPublished(mod.meta)) return undefined
  return mod
}

/** Admin-only lookup that ignores the publish gate so the
 *  /admin/blog/[slug] preview can render scheduled drafts. Never
 *  use this in a public route. */
export function getPostIncludingScheduled(
  slug: string,
): BlogPostModule | undefined {
  return MODULES.find((m) => m.meta.slug === slug)
}

export function getAllSlugs(): string[] {
  return MODULES.filter((m) => isPublished(m.meta)).map((m) => m.meta.slug)
}
