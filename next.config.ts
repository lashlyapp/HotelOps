import type { NextConfig } from 'next'

const cdnUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
const cdn = cdnUrl ? new URL(cdnUrl) : null

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
}

export default nextConfig
