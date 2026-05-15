import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

// Player runs full-screen on a TV. Images come from the same R2 CDN the
// operator app uses; we whitelist that origin so <img> sources work
// without next/image proxying every request.
const cdnUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
const cdn = cdnUrl ? new URL(cdnUrl) : null

// Pin the workspace root to this folder so Turbopack doesn't traverse up
// to the operator app's package-lock.json and try to compile its source.
const here = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  turbopack: {
    root: here,
  },
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
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // Block search engines: the player URL is per-screen and not
          // intended to be discovered or shared.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]
  },
}

export default nextConfig
