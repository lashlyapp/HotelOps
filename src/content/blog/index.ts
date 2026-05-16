import * as eventPipeline from './posts/boutique-hotel-event-pipeline'
import * as guestConciergeCost from './posts/guest-concierge-app-cost'
import * as guestExpectations from './posts/guest-expectations'
import * as hotelSignageCost from './posts/hotel-digital-signage-cost-2026'
import * as wifiSetup from './posts/hotel-guest-wifi-setup'
import * as maintenanceTicket from './posts/maintenance-ticket-that-closes'
import * as modernizeChecklist from './posts/modernize-your-boutique-hotel'
import * as multiPropertyGroup from './posts/multi-property-boutique-group'
import * as operationsBudget from './posts/operations-budget'
import * as pmsVsOperations from './posts/pms-vs-operations-system'
import * as techModernization from './posts/tech-modernization'
import * as underservedIndustry from './posts/underserved-industry'
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
  eventPipeline,
  multiPropertyGroup,
  guestConciergeCost,
  wifiSetup,
  maintenanceTicket,
  modernizeChecklist,
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

export function getAllSlugs(): string[] {
  return MODULES.filter((m) => isPublished(m.meta)).map((m) => m.meta.slug)
}
