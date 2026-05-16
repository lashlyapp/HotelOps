import type { ComponentType } from 'react'

export type BlogPostMeta = {
  slug: string
  title: string
  description: string
  /** ISO 8601 date string, e.g. "2026-05-12". */
  publishedAt: string
  readingMinutes: number
  /** Short topic label shown above the headline. */
  topic: string
  heroImage: string
  heroAlt: string
}

export type BlogPostModule = {
  meta: BlogPostMeta
  default: ComponentType
}
