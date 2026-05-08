/**
 * Quick R2 smoke test:
 *   npx tsx scripts/smoke-r2.ts
 *
 * Lists the first 10 keys in the bucket so we can verify credentials and
 * folder structure without going through the UI.
 */

import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'

loadEnv({ path: resolve(process.cwd(), '.env.local') })

const client = new S3Client({
  region: 'auto',
  endpoint: required('R2_ENDPOINT'),
  credentials: {
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
  },
})

async function main() {
  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: required('R2_BUCKET'),
      MaxKeys: 10,
    }),
  )
  if (!res.Contents?.length) {
    console.log('Bucket is empty.')
    return
  }
  console.log(`First ${res.Contents.length} objects:`)
  for (const obj of res.Contents) {
    console.log(`  ${obj.Key}  (${obj.Size} bytes)`)
  }
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return v
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
