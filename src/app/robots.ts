import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

/**
 * Allow indexing of marketing routes only. The app shell, auth flows,
 * and per-tenant API surface aren't useful in search results and a
 * stale Google cache of a billing page is the kind of thing nobody
 * wants to explain.
 *
 * Next 16 serves this file at /robots.txt automatically.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/pricing', '/privacy', '/terms', '/signup'],
        disallow: [
          '/admin',
          '/api/',
          '/dashboard',
          '/account',
          '/billing',
          '/events',
          '/work-orders',
          '/signage',
          '/arrival',
          '/it-hub',
          '/media',
          '/properties',
          '/team',
          // /a/<slug> arrival pages are token-distributed (printed QR)
          // and not meant to be discoverable via search. The page itself
          // also carries a `noindex,nofollow` meta tag (belt + braces).
          '/a/',
          // /proposal/<token> is a one-time signed link to a specific
          // event proposal; should never be indexed.
          '/proposal/',
          // Setup-password flow is one-time-token only.
          '/set-password',
        ],
      },
    ],
    sitemap: `https://www.${BRAND.domain}/sitemap.xml`,
  }
}
