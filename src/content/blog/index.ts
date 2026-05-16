import * as guestExpectations from './posts/guest-expectations'
import * as hotelSignageCost from './posts/hotel-digital-signage-cost-2026'
import * as modernizeChecklist from './posts/modernize-your-boutique-hotel'
import * as operationsBudget from './posts/operations-budget'
import * as pmsVsOperations from './posts/pms-vs-operations-system'
import * as techModernization from './posts/tech-modernization'
import * as underservedIndustry from './posts/underserved-industry'
import type { BlogPostMeta, BlogPostModule } from './types'

const MODULES: BlogPostModule[] = [
  modernizeChecklist,
  underservedIndustry,
  pmsVsOperations,
  operationsBudget,
  hotelSignageCost,
  techModernization,
  guestExpectations,
]

/** All posts, newest first. */
export const posts: BlogPostMeta[] = MODULES.map((m) => m.meta).sort((a, b) =>
  b.publishedAt.localeCompare(a.publishedAt),
)

export function getPost(slug: string): BlogPostModule | undefined {
  return MODULES.find((m) => m.meta.slug === slug)
}

export function getAllSlugs(): string[] {
  return MODULES.map((m) => m.meta.slug)
}
