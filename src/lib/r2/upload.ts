import 'server-only'
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
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

/**
 * Presigned GET URL with a forced Content-Disposition. Used by the
 * "Download" UI so the browser saves files instead of navigating to them
 * (R2's default response is inline). URL valid for 5 minutes.
 */
export async function r2PresignDownloadUrl(
  key: string,
  filename: string,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: r2Bucket(),
    Key: key,
    ResponseContentDisposition: `attachment; filename="${sanitizeForHeader(filename)}"`,
  })
  return getSignedUrl(r2Client(), command, { expiresIn: 300 })
}

function sanitizeForHeader(name: string): string {
  // RFC 6266 quoted-string: drop characters that would break the header
  // or let a caller smuggle additional directives.
  return name.replace(/[\\"\r\n]/g, '_')
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

// ----------------------------------------------------------------------------
// Multipart upload — for large files (videos, originals).
// Browser uploads each part directly to R2 via a presigned URL.
// ----------------------------------------------------------------------------

const MULTIPART_URL_TTL_SECONDS = 60 * 60 // 1 hour

export async function r2CreateMultipartUpload(
  key: string,
  contentType: string,
): Promise<string> {
  const res = await r2Client().send(
    new CreateMultipartUploadCommand({
      Bucket: r2Bucket(),
      Key: key,
      ContentType: contentType,
    }),
  )
  if (!res.UploadId) throw new Error('R2 did not return an UploadId')
  return res.UploadId
}

/**
 * Presign every part URL upfront so the browser does N HTTP PUTs without
 * round-tripping through Vercel for each one. URLs valid for 1 hour.
 */
export async function r2PresignParts(
  key: string,
  uploadId: string,
  partCount: number,
): Promise<string[]> {
  const client = r2Client()
  const bucket = r2Bucket()
  return Promise.all(
    Array.from({ length: partCount }, (_, i) => {
      const command = new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: i + 1,
      })
      return getSignedUrl(client, command, {
        expiresIn: MULTIPART_URL_TTL_SECONDS,
      })
    }),
  )
}

export async function r2CompleteMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>,
): Promise<void> {
  await r2Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: r2Bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .slice()
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  )
}

export async function r2AbortMultipartUpload(
  key: string,
  uploadId: string,
): Promise<void> {
  try {
    await r2Client().send(
      new AbortMultipartUploadCommand({
        Bucket: r2Bucket(),
        Key: key,
        UploadId: uploadId,
      }),
    )
  } catch {
    // Best-effort; if the upload was never created or already aborted, fine.
  }
}
