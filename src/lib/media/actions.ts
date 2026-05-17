'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath, revalidateTag } from 'next/cache'
import { after } from 'next/server'
import { requireOrgUser } from '@/lib/auth/session'
import { mediaCacheTag } from '@/lib/media/cache-tags'
import { tagUploadedImage } from '@/lib/media/vision'
import { r2PublicUrl } from '@/lib/r2/client'
import {
  r2AbortMultipartUpload,
  r2CompleteMultipartUpload,
  r2CreateMultipartUpload,
  r2DeleteObject,
  r2ObjectExists,
  r2PresignDownloadUrl,
  r2PresignParts,
  r2PresignPutUrl,
} from '@/lib/r2/upload'
import { checkRateLimit } from '@/lib/rate-limit'
import { checkStorageGuardrails } from '@/lib/storage/guardrails'
import { createAdminClient } from '@/lib/supabase/admin'

// Both images and videos go through R2 now; videos used to take the
// Cloudflare Stream side-path but the per-minute storage cost made that
// untenable for a multi-tenant catalog feeding consumer-facing room pages.
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
  'video/mp4',
  'video/quicktime',
  'video/webm',
])
const MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024 // 5 GB cap covers HD room videos comfortably.

const TAG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const TAG_MAX_LENGTH = 30
const MAX_TAGS_PER_FILE = 20

// Cover images live next to the video they describe, under a hidden
// _posters/ subprefix so they don't show up in the catalog listing.
const POSTER_PREFIX = '_posters/'
const POSTER_CONTENT_TYPE = 'image/jpeg'
const MAX_POSTER_BYTES = 5 * 1024 * 1024

// Bust the catalog's unstable_cache entry for one property. Used by every
// write path so a freshly-uploaded file shows up on the next /media render
// instead of waiting out the 30-second TTL.
function bustMediaCache(propertyId: string) {
  revalidateTag(mediaCacheTag(propertyId), 'max')
}

// Per-user rate limit for presign + multipart-init endpoints. 60 requests
// per minute = 1/sec sustained — generous for a tenant batch-uploading
// images and videos, low enough to throttle a runaway client. The check is
// best-effort across function instances (see lib/rate-limit.ts).
const PRESIGN_LIMIT = { limit: 60, windowMs: 60_000 } as const

// ----------------------------------------------------------------------------
// Upload — presigned URL flow
// ----------------------------------------------------------------------------

export type PresignResult =
  | {
      ok: true
      key: string
      url: string
      /** Non-null when accepting this upload pushes the property into a
       *  new billing block (or further beyond the soft quota). The UI
       *  shows it as a one-time confirmation so the operator knows what
       *  the charge will be before they commit. */
      warning?: {
        kind: 'storage_block_added'
        message: string
      }
    }
  | { ok: false; error: string }

/**
 * Authorize the caller for this property and return a presigned PUT URL the
 * browser uses to upload the file directly to R2.
 *
 * Enforces both file-level and account-level guardrails:
 *   - File type / size: same MIME allow-list and 5 GB-per-file cap as before
 *   - Storage hard cap: refuse uploads that would push the property's
 *     total usage past STORAGE_HARD_CAP_BYTES (500 GB). Anyone hitting
 *     this is doing something we'd want to talk to them about anyway.
 *   - Storage soft cap: allow uploads that put the property over its
 *     paid block but surface a `warning` so the UI can show a one-time
 *     confirmation explaining the billing impact (+$5/property/month).
 */
export async function presignUploadAction(args: {
  propertyId: string
  filename: string
  contentType: string
  size: number
}): Promise<PresignResult> {
  const session = await requireOrgUser({ write: true })

  const rl = checkRateLimit(`presign:${session.userId}`, PRESIGN_LIMIT)
  if (!rl.ok) {
    return { ok: false, error: 'Too many upload requests — slow down a moment.' }
  }

  if (!ALLOWED_MIME.has(args.contentType)) {
    return { ok: false, error: `${args.contentType} is not an allowed file type.` }
  }
  if (args.size > MAX_FILE_BYTES) {
    return { ok: false, error: 'File exceeds 5 GB limit.' }
  }
  if (args.size <= 0) {
    return { ok: false, error: 'Empty file.' }
  }

  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return { ok: false, error: 'Property not found.' }

  // Storage quota guardrails. Reads the cached storage_used_bytes the
  // nightly cron stamps; freshness lags reality by up to one cron
  // interval which is fine — the math we care about is "approximate
  // capacity left", not "exactly which byte you just uploaded".
  const quotaCheck = checkStorageGuardrails(property, args.size)
  if (!quotaCheck.ok) return quotaCheck

  const safe = sanitizeFilename(args.filename)
  if (!safe) return { ok: false, error: 'Invalid filename.' }

  const key = await uniqueKey(property.r2_prefix, safe)
  const url = await r2PresignPutUrl(key, args.contentType)
  return quotaCheck.warning
    ? { ok: true, key, url, warning: quotaCheck.warning }
    : { ok: true, key, url }
}


/**
 * Trigger UI revalidation after the browser finishes uploading. The actual
 * file write happens in the browser → R2; this is just a cache-bust + a
 * place to do post-upload bookkeeping later (e.g. virus scan kickoff).
 */
export async function revalidateAfterUploadAction(args: {
  propertySlug: string
  propertyId: string
}) {
  const session = await requireOrgUser({ write: true })
  if (session.properties.some((p) => p.id === args.propertyId)) {
    bustMediaCache(args.propertyId)
  }
  revalidatePath(`/media`)
  revalidatePath(`/dashboard`)
  // Slug retained for future per-property path scoping.
  void args.propertySlug
}

/**
 * Schedule the background vision-tag pass on a freshly-uploaded
 * image. Called from the drop-zone right after the R2 PUT succeeds.
 * Returns immediately; the analyzeImageWithVision + persist runs via
 * `after()` so the browser's batch-upload loop never blocks on AI
 * latency. Best-effort — failures are logged inside tagUploadedImage
 * and never surface to the customer. Non-image content types are
 * skipped at the tagger.
 */
export async function scheduleMediaVisionTagAction(args: {
  propertyId: string
  key: string
  contentType: string
}): Promise<void> {
  const session = await requireOrgUser({ write: true })
  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return
  if (!args.key.startsWith(property.r2_prefix)) return
  const { key, contentType, propertyId } = args
  after(() =>
    tagUploadedImage({
      propertyId,
      key,
      publicUrl: r2PublicUrl(key),
      contentType,
    }),
  )
}

// ----------------------------------------------------------------------------
// Multipart upload — for large files (recommended threshold: > 10 MB).
// All part URLs are presigned upfront so the browser only round-trips through
// Vercel twice per file (init + complete) regardless of part count.
// ----------------------------------------------------------------------------

const PART_SIZE = 8 * 1024 * 1024 // 8 MB per part — sweet spot for R2/S3.
const MAX_PARTS = 10_000 // S3 multipart hard limit.

export type InitMultipartResult =
  | {
      ok: true
      key: string
      uploadId: string
      partUrls: string[]
      partSize: number
    }
  | { ok: false; error: string }

export async function initMultipartUploadAction(args: {
  propertyId: string
  filename: string
  contentType: string
  size: number
}): Promise<InitMultipartResult> {
  const session = await requireOrgUser({ write: true })

  const rl = checkRateLimit(`presign:${session.userId}`, PRESIGN_LIMIT)
  if (!rl.ok) {
    return { ok: false, error: 'Too many upload requests — slow down a moment.' }
  }

  if (!ALLOWED_MIME.has(args.contentType)) {
    return { ok: false, error: `${args.contentType} is not an allowed file type.` }
  }
  if (args.size > MAX_FILE_BYTES) {
    return { ok: false, error: 'File exceeds 5 GB limit.' }
  }
  if (args.size <= 0) {
    return { ok: false, error: 'Empty file.' }
  }

  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return { ok: false, error: 'Property not found.' }

  const safe = sanitizeFilename(args.filename)
  if (!safe) return { ok: false, error: 'Invalid filename.' }

  const partCount = Math.ceil(args.size / PART_SIZE)
  if (partCount > MAX_PARTS) {
    return { ok: false, error: 'File has too many parts.' }
  }

  const key = await uniqueKey(property.r2_prefix, safe)
  const uploadId = await r2CreateMultipartUpload(key, args.contentType)
  const partUrls = await r2PresignParts(key, uploadId, partCount)

  return { ok: true, key, uploadId, partUrls, partSize: PART_SIZE }
}

export async function completeMultipartUploadAction(args: {
  propertyId: string
  key: string
  uploadId: string
  parts: Array<{ partNumber: number; etag: string }>
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOrgUser({ write: true })
  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return { ok: false, error: 'Property not found.' }
  if (!args.key.startsWith(property.r2_prefix)) {
    return { ok: false, error: 'Key not under this property.' }
  }
  try {
    await r2CompleteMultipartUpload(args.key, args.uploadId, args.parts)
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Complete failed'
    return { ok: false, error: message }
  }
}

export async function abortMultipartUploadAction(args: {
  propertyId: string
  key: string
  uploadId: string
}) {
  const session = await requireOrgUser({ write: true })
  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return
  if (!args.key.startsWith(property.r2_prefix)) return
  await r2AbortMultipartUpload(args.key, args.uploadId)
}

// ----------------------------------------------------------------------------
// Cover image — captured client-side from the video file. Two-step flow so
// the browser can PUT the JPEG directly to R2 (same pattern as the video
// upload itself), then notify the server to record poster_key against the
// owning video's media_metadata row.
// ----------------------------------------------------------------------------

export type PresignPosterResult =
  | { ok: true; posterKey: string; url: string }
  | { ok: false; error: string }

export async function presignPosterUploadAction(args: {
  propertyId: string
  videoKey: string
  size: number
}): Promise<PresignPosterResult> {
  const session = await requireOrgUser({ write: true })

  const rl = checkRateLimit(`presign:${session.userId}`, PRESIGN_LIMIT)
  if (!rl.ok) {
    return { ok: false, error: 'Too many upload requests — slow down a moment.' }
  }

  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return { ok: false, error: 'Property not found.' }
  if (!args.videoKey.startsWith(property.r2_prefix)) {
    return { ok: false, error: 'Video does not belong to this property.' }
  }
  if (args.size <= 0 || args.size > MAX_POSTER_BYTES) {
    return { ok: false, error: 'Invalid poster size.' }
  }

  const posterKey = posterKeyFor(property.r2_prefix, args.videoKey)
  const url = await r2PresignPutUrl(posterKey, POSTER_CONTENT_TYPE)
  return { ok: true, posterKey, url }
}

export async function setVideoPosterAction(args: {
  propertyId: string
  videoKey: string
  posterKey: string
}): Promise<{ ok: true; posterUrl: string } | { ok: false; error: string }> {
  const session = await requireOrgUser({ write: true })
  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return { ok: false, error: 'Property not found.' }
  if (!args.videoKey.startsWith(property.r2_prefix)) {
    return { ok: false, error: 'Video does not belong to this property.' }
  }
  // Belt-and-suspenders: poster_key must live under _posters/ in the same
  // property prefix the video lives under, so a hostile client can't point
  // poster_key at an arbitrary R2 object.
  const expected = posterKeyFor(property.r2_prefix, args.videoKey)
  if (args.posterKey !== expected) {
    return { ok: false, error: 'Invalid poster key.' }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('media_metadata').upsert(
    {
      property_id: args.propertyId,
      file_key: args.videoKey,
      poster_key: args.posterKey,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'property_id,file_key' },
  )
  if (error) return { ok: false, error: error.message }

  bustMediaCache(args.propertyId)
  revalidatePath('/media')
  return { ok: true, posterUrl: r2PublicUrl(args.posterKey) }
}

function posterKeyFor(propertyPrefix: string, videoKey: string): string {
  // videoKey is "{propertyPrefix}{filename}". Place the poster under
  // {propertyPrefix}_posters/{filename}.jpg so the catalog listing's
  // _posters/ filter hides it from the user-facing file list.
  const filename = videoKey.slice(propertyPrefix.length)
  return `${propertyPrefix}${POSTER_PREFIX}${filename}.jpg`
}

// ----------------------------------------------------------------------------
// Delete a media file
// ----------------------------------------------------------------------------

async function deleteOneByKey(args: {
  propertyId: string
  r2Prefix: string
  key: string
}): Promise<boolean> {
  // Tenant guard: key must live under the property prefix.
  if (!args.key.startsWith(args.r2Prefix)) return false
  await r2DeleteObject(args.key)

  // If the file had a poster, drop that sibling object too. We look up the
  // poster_key from media_metadata rather than recomputing it because a
  // future v2 might allow custom poster keys.
  const admin = createAdminClient()
  const { data: meta } = await admin
    .from('media_metadata')
    .select('poster_key')
    .eq('property_id', args.propertyId)
    .eq('file_key', args.key)
    .maybeSingle()
  if (meta?.poster_key) {
    await r2DeleteObject(meta.poster_key)
  }
  return true
}

export async function deleteMediaAction(args: {
  propertyId: string
  key: string
}) {
  const session = await requireOrgUser({ write: true })
  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return

  const ok = await deleteOneByKey({
    propertyId: args.propertyId,
    r2Prefix: property.r2_prefix,
    key: args.key,
  })
  if (!ok) return

  // Drop tag + metadata rows so they don't linger.
  const admin = createAdminClient()
  await admin
    .from('media_tags')
    .delete()
    .eq('property_id', args.propertyId)
    .eq('file_key', args.key)
  await admin
    .from('media_metadata')
    .delete()
    .eq('property_id', args.propertyId)
    .eq('file_key', args.key)

  bustMediaCache(args.propertyId)
  revalidatePath('/media')
  revalidatePath('/dashboard')
}

const MAX_BULK_OPERATION = 500

export async function bulkDeleteMediaAction(args: {
  propertyId: string
  keys: string[]
}): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const session = await requireOrgUser({ write: true })
  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return { ok: false, error: 'Property not found.' }

  // Cap so a single request can't take down the API.
  if (args.keys.length === 0) return { ok: true, deleted: 0 }
  if (args.keys.length > MAX_BULK_OPERATION) {
    return { ok: false, error: `Select at most ${MAX_BULK_OPERATION} files at a time.` }
  }

  const results = await Promise.all(
    args.keys.map((key) =>
      deleteOneByKey({
        propertyId: args.propertyId,
        r2Prefix: property.r2_prefix,
        key,
      })
        .then((ok) => (ok ? key : null))
        .catch(() => null),
    ),
  )
  const deletedKeys = results.filter((k): k is string => k !== null)

  if (deletedKeys.length > 0) {
    const admin = createAdminClient()
    await admin
      .from('media_tags')
      .delete()
      .eq('property_id', args.propertyId)
      .in('file_key', deletedKeys)
    await admin
      .from('media_metadata')
      .delete()
      .eq('property_id', args.propertyId)
      .in('file_key', deletedKeys)
  }

  bustMediaCache(args.propertyId)
  revalidatePath('/media')
  revalidatePath('/dashboard')
  return { ok: true, deleted: deletedKeys.length }
}

// ----------------------------------------------------------------------------
// Download — presigned GET (R2)
// ----------------------------------------------------------------------------

export type DownloadUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

export async function presignDownloadAction(args: {
  propertyId: string
  key: string
  filename: string
}): Promise<DownloadUrlResult> {
  const session = await requireOrgUser({ write: true })
  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return { ok: false, error: 'Property not found.' }

  if (!args.key.startsWith(property.r2_prefix)) {
    return { ok: false, error: 'File does not belong to this property.' }
  }
  const url = await r2PresignDownloadUrl(args.key, args.filename)
  return { ok: true, url }
}

// ----------------------------------------------------------------------------
// Per-file metadata (display name override + description)
// ----------------------------------------------------------------------------

const MAX_DISPLAY_NAME = 120
const MAX_DESCRIPTION = 500

export type MetadataResult =
  | { ok: true; displayName: string | null; description: string | null }
  | { ok: false; error: string }

export async function updateMediaMetadataAction(args: {
  propertyId: string
  key: string
  displayName: string
  description: string
}): Promise<MetadataResult> {
  const session = await requireOrgUser({ write: true })
  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return { ok: false, error: 'Property not found.' }
  if (!args.key.startsWith(property.r2_prefix)) {
    return { ok: false, error: 'File does not belong to this property.' }
  }

  const displayName = args.displayName.trim().slice(0, MAX_DISPLAY_NAME) || null
  const description = args.description.trim().slice(0, MAX_DESCRIPTION) || null

  const admin = createAdminClient()
  const { error } = await admin.from('media_metadata').upsert(
    {
      property_id: args.propertyId,
      file_key: args.key,
      display_name: displayName,
      description,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'property_id,file_key' },
  )
  if (error) return { ok: false, error: error.message }

  bustMediaCache(args.propertyId)
  revalidatePath('/media')
  return { ok: true, displayName, description }
}

// ----------------------------------------------------------------------------
// Tags
// ----------------------------------------------------------------------------

export type TagResult =
  | { ok: true; tags: string[] }
  | { ok: false; error: string }

export async function addTagAction(args: {
  propertyId: string
  key: string
  tag: string
}): Promise<TagResult> {
  const session = await requireOrgUser({ write: true })
  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return { ok: false, error: 'Property not found.' }
  if (!args.key.startsWith(property.r2_prefix)) {
    return { ok: false, error: 'File does not belong to this property.' }
  }

  const tag = normalizeTag(args.tag)
  if (!tag) {
    return { ok: false, error: 'Tag must be 1–30 lowercase letters, digits, or hyphens.' }
  }

  const admin = createAdminClient()

  const { count } = await admin
    .from('media_tags')
    .select('*', { count: 'exact', head: true })
    .eq('property_id', args.propertyId)
    .eq('file_key', args.key)
  if ((count ?? 0) >= MAX_TAGS_PER_FILE) {
    return { ok: false, error: `Up to ${MAX_TAGS_PER_FILE} tags per file.` }
  }

  const { error } = await admin
    .from('media_tags')
    .insert({ property_id: args.propertyId, file_key: args.key, tag })
  if (error && error.code !== '23505') {
    // 23505 = unique violation; tag already present is a no-op success.
    return { ok: false, error: error.message }
  }

  const updated = await listTagsForFile(args.propertyId, args.key)
  bustMediaCache(args.propertyId)
  revalidatePath('/media')
  return { ok: true, tags: updated }
}

export async function removeTagAction(args: {
  propertyId: string
  key: string
  tag: string
}): Promise<TagResult> {
  const session = await requireOrgUser({ write: true })
  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return { ok: false, error: 'Property not found.' }
  if (!args.key.startsWith(property.r2_prefix)) {
    return { ok: false, error: 'File does not belong to this property.' }
  }

  const tag = normalizeTag(args.tag)
  if (!tag) return { ok: false, error: 'Invalid tag.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('media_tags')
    .delete()
    .eq('property_id', args.propertyId)
    .eq('file_key', args.key)
    .eq('tag', tag)
  if (error) return { ok: false, error: error.message }

  const updated = await listTagsForFile(args.propertyId, args.key)
  bustMediaCache(args.propertyId)
  revalidatePath('/media')
  return { ok: true, tags: updated }
}

async function listTagsForFile(
  propertyId: string,
  key: string,
): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('media_tags')
    .select('tag')
    .eq('property_id', propertyId)
    .eq('file_key', key)
    .order('tag', { ascending: true })
  return (data ?? []).map((r) => r.tag)
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function sanitizeFilename(raw: string): string | null {
  const base = raw.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)
  if (!cleaned) return null
  return cleaned
}

async function uniqueKey(prefix: string, filename: string): Promise<string> {
  // Preserve the user's filename when there's no collision (1 HEAD call).
  // Under contention or for repeat names, append 8 hex chars (4 random
  // bytes = 4 billion candidates) so even a busy property never sequential-
  // probes 50× HEAD calls in a row to find a free slot.
  const proposed = `${prefix}${filename}`
  if (!(await r2ObjectExists(proposed))) return proposed

  const dot = filename.lastIndexOf('.')
  const stem = dot === -1 ? filename : filename.slice(0, dot)
  const ext = dot === -1 ? '' : filename.slice(dot)
  const suffix = randomBytes(4).toString('hex')
  return `${prefix}${stem}-${suffix}${ext}`
}

function normalizeTag(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, '-')
  if (t.length === 0 || t.length > TAG_MAX_LENGTH) return null
  if (!TAG_RE.test(t)) return null
  return t
}
