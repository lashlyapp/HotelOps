import type { MetadataRoute } from 'next'
import { posts } from '@/content/blog'
import { BRAND } from '@/lib/brand'

/**
 * Public sitemap. We only list the marketing surface — `/`, `/pricing`,
 * `/blog` (plus each published blog post), and the legal pages. App
 * routes (/dashboard, /billing, etc.) are authed-only and shouldn't be
 * in search results; the public arrival pages at /a/<slug> have
 * `noindex,nofollow` set per-page and aren't meant to be discovered
 * via search either.
 *
 * Revalidated hourly so scheduled blog posts (date-gated in
 * src/content/blog/index.ts) appear in search engines within
 * ~60 minutes of their publishedAt cutover. Next 16 picks this file
 * up automatically at /sitemap.xml.
 */
export const revalidate = 3600
export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://www.${BRAND.domain}`
  const now = new Date()
  return [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${base}/pricing`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${base}/blog`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...posts.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: new Date(p.publishedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    {
      url: `${base}/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${base}/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ]
}
