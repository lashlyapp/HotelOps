import type { NextConfig } from 'next'

const cdnUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
const cdn = cdnUrl ? new URL(cdnUrl) : null

// Stripe Checkout / Customer Portal that we redirect customers to.
const STRIPE_HOSTS = ['https://js.stripe.com', 'https://checkout.stripe.com']

// Build a Content-Security-Policy that's strict but permissive of the
// third-parties we actually use: Supabase (auth + realtime over the
// project's own subdomain), the R2 CDN (images + media), Stripe.
function contentSecurityPolicy(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseHost = supabaseUrl ? new URL(supabaseUrl).origin : null
  const cdnHost = cdn?.origin ?? null

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'", ...STRIPE_HOSTS],
    // Next.js inlines small bits of script at build time + uses inline
    // styles for streaming SSR. Allowing `unsafe-inline` for these is
    // standard for Next apps that don't have CSP nonces wired through
    // middleware. Tighten with a nonce pass later if we add an SSR
    // middleware.
    'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", ...STRIPE_HOSTS],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      ...(cdnHost ? [cdnHost] : []),
      ...(supabaseHost ? [supabaseHost] : []),
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
    remotePatterns: cdn
      ? [
          {
            protocol: cdn.protocol.replace(/:$/, '') as 'http' | 'https',
            hostname: cdn.hostname,
            pathname: '/**',
          },
        ]
      : [],
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
