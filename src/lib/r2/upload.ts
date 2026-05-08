import 'server-only'
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { r2Bucket, r2Client } from './client'

export async function r2PutObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
) {
  await r2Client().send(
    new PutObjectCommand({
      Bucket: r2Bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
}

export async function r2DeleteObject(key: string) {
  try {
    await r2Client().send(
      new DeleteObjectCommand({
        Bucket: r2Bucket(),
        Key: key,
      }),
    )
  } catch {
    // Best-effort delete — if the object doesn't exist (already gone), don't
    // block the user-facing flow.
  }
}
