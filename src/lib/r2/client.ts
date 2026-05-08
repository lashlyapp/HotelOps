import 'server-only'
import { S3Client } from '@aws-sdk/client-s3'

let cached: S3Client | null = null

export function r2Client(): S3Client {
  if (cached) return cached
  cached = new S3Client({
    region: 'auto',
    endpoint: requireEnv('R2_ENDPOINT'),
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  })
  return cached
}

export function r2Bucket(): string {
  return requireEnv('R2_BUCKET')
}

export function r2PublicUrl(key: string): string {
  const base = requireEnv('NEXT_PUBLIC_R2_PUBLIC_URL').replace(/\/+$/, '')
  const encoded = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${base}/${encoded}`
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}
