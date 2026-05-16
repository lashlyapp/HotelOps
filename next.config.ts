import type { NextConfig } from 'next'

const cdnUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
const cdn = cdnUrl ? new URL(cdnUrl) : null

// Stripe Checkout that we redirect customers to (used by setup-checkout
// for adding/swapping payment methods). Billing details are now edited
// in-app, so the Customer Portal is no longer in this list.
const STRIPE_HOSTS = ['https://js.stripe.com', 'https://checkout.stripe.com']

// Build a Content-Security-Policy that's strict but permissive of the
// third-parties we actually use: Supabase (auth + realtime over the
// project's own subdomain), the R2 CDN (images + media), Stripe.
function contentSecurityPolicy(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseHost = supabaseUrl ? new URL(supabaseUrl).origin : null
  const cdnHost = cdn?.origin ?? null
  // `unsafe-eval` is only needed by the Next.js dev server (HMR/Fast
  // Refresh wraps modules in `eval`). Production builds don't use it,
  // so we drop it from the production CSP to shrink the XSS blast
  // radius. `unsafe-inline` for scripts/styles stays for now — removing
  // it requires a per-request nonce pipeline (separate effort).
  const isDev = process.env.NODE_ENV !== 'production'
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    ...(isDev ? ["'unsafe-eval'"] : []),
    ...STRIPE_HOSTS,
  ]

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'", ...STRIPE_HOSTS],
    'script-src': scriptSrc,
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      ...(cdnHost ? [cdnHost] : []),
      ...(supabaseHost ? [supabaseHost] : []),
      // Unsplash CDN — sourced city-destination photos on the
      // marketing landing page. Free for commercial use, no
      // attribution required; we hotlink rather than re-host so we
      // don't fan out a /public/ blob library for placeholder
      // imagery. Swap to /-relative paths once licensed Adobe Stock
      // photos land per docs/marketing-imagery.md.
      'https://images.unsplash.com',
    ],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      ...(supabaseHost ? [supabaseHost, supabaseHost.replace(/^https/, 'wss')] : []),
      ...(cdnHost ? [cdnHost] : []),
      'https://api.stripe.com',
    ],
    'frame-src': [...STRIPE_HOSTS],
    'media-src': ["'self'", 'blob:', ...(cdnHost ? [cdnHost] : [])],
  }

  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ')
}

const SECURITY_HEADERS = [
  // HTTPS-only. preload eligibility documented at hstspreload.org;
  // includeSubDomains is safe because every subdomain we use is HTTPS.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // Don't expose document content inside an attacker-controlled iframe.
  // (Defence in depth: frame-ancestors in CSP also enforces this.)
  { key: 'X-Frame-Options', value: 'DENY' },
  // Block MIME-type sniffing so a misconfigured upload can't be served
  // as a script.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Don't leak full URLs in Referer when navigating off-site.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable browser features we don't use so a compromised script can't
  // suddenly enable, say, the microphone or geolocation prompt.
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com"), usb=(), interest-cohort=()',
  },
  // CSP — last so it overrides the rest if there's any conflict.
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
]

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...(cdn
        ? [
            {
              protocol: cdn.protocol.replace(/:$/, '') as 'http' | 'https',
              hostname: cdn.hostname,
              pathname: '/**',
            },
          ]
        : []),
      // Unsplash CDN for marketing placeholder imagery (destinations
      // band on /). Replace with self-hosted /landmarks/*.jpg once
      // licensed Adobe Stock photos land — see
      // /public/landmarks/README.md.
      {
        protocol: 'https' as const,
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: SECURITY_HEADERS,
      },
    ]
  },
}

export default nextConfig
