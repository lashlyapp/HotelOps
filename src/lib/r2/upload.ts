import 'server-only'
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
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

/**
 * Generate a presigned PUT URL the browser can upload directly to. Bypasses
 * Vercel's 4.5 MB request body limit for serverless functions, so large
 * hotel media (videos, original-resolution photos) goes straight to R2.
 *
 * URL is valid for 5 minutes.
 */
export async function r2PresignPutUrl(
  key: string,
  contentType: string,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: r2Bucket(),
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(r2Client(), command, { expiresIn: 300 })
}

export async function r2ObjectExists(key: string): Promise<boolean> {
  try {
    await r2Client().send(
      new HeadObjectCommand({ Bucket: r2Bucket(), Key: key }),
    )
    return true
  } catch {
    return false
  }
}
