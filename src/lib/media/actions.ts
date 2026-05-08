'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgUser } from '@/lib/auth/session'
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
import {
  streamDeleteVideo,
  streamEnableMp4Download,
  streamGetVideo,
  streamMp4DownloadUrl,
} from '@/lib/stream/client'
import { createAdminClient } from '@/lib/supabase/admin'

// Image uploads still go to R2; videos route to Cloudflare Stream via the
// dedicated /api/media/stream-upload route handler and don't pass through
// this allowlist.
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
])
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024 // 2 GB cap on R2 image uploads

// All Stream-hosted videos use this synthetic file_key so existing
// media_metadata + media_tags rows continue to apply uniformly.
const STREAM_KEY_PREFIX = 'stream:'
function streamUidFromKey(key: string): string | null {
  return key.startsWith(STREAM_KEY_PREFIX)
    ? key.slice(STREAM_KEY_PREFIX.length)
    : null
}

const TAG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const TAG_MAX_LENGTH = 30
const MAX_TAGS_PER_FILE = 20

// ----------------------------------------------------------------------------
// Upload — presigned URL flow
// ----------------------------------------------------------------------------

export type PresignResult =
  | { ok: true; key: string; url: string }
  | { ok: false; error: string }

/**
 * Authorize the caller for this property and return a presigned PUT URL the
 * browser uses to upload the file directly to R2.
 */
export async function presignUploadAction(args: {
  propertyId: string
  filename: string
  contentType: string
  size: number
}): Promise<PresignResult> {
  const session = await requireOrgUser()

  if (!ALLOWED_MIME.has(args.contentType)) {
    return { ok: false, error: `${args.contentType} is not an allowed file type.` }
  }
  if (args.size > MAX_FILE_BYTES) {
    return { ok: false, error: 'File exceeds 2 GB limit.' }
  }
  if (args.size <= 0) {
    return { ok: false, error: 'Empty file.' }
  }

  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return { ok: false, error: 'Property not found.' }

  const safe = sanitizeFilename(args.filename)
  if (!safe) return { ok: false, error: 'Invalid filename.' }

  const key = await uniqueKey(property.r2_prefix, safe)
  const url = await r2PresignPutUrl(key, args.contentType)
  return { ok: true, key, url }
}

/**
 * Trigger UI revalidation after the browser finishes uploading. The actual
 * file write happens in the browser → R2; this is just a cache-bust + a
 * place to do post-upload bookkeeping later (e.g. virus scan kickoff).
 */
export async function revalidateAfterUploadAction(propertySlug: string) {
  await requireOrgUser()
  revalidatePath(`/media`)
  revalidatePath(`/dashboard`)
  // No-op header to read the slug for path scoping later if needed.
  void propertySlug
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
  const session = await requireOrgUser()

  if (!ALLOWED_MIME.has(args.contentType)) {
    return { ok: false, error: `${args.contentType} is not an allowed file type.` }
  }
  if (args.size > MAX_FILE_BYTES) {
    return { ok: false, error: 'File exceeds 2 GB limit.' }
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
  const session = await requireOrgUser()
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
  const session = await requireOrgUser()
  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return
  if (!args.key.startsWith(property.r2_prefix)) return
  await r2AbortMultipartUpload(args.key, args.uploadId)
}

// ----------------------------------------------------------------------------
// Delete a media file
// ----------------------------------------------------------------------------

async function deleteOneByKey(args: {
  propertyId: string
  r2Prefix: string
  key: string
}): Promise<boolean> {
  const uid = streamUidFromKey(args.key)
  if (uid) {
    // Stream-hosted video. Belongs to this property iff a row exists in
    // media_videos under (property_id, stream_uid).
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('media_videos')
      .select('stream_uid')
      .eq('property_id', args.propertyId)
      .eq('stream_uid', uid)
      .maybeSingle()
    if (error || !data) return false
    await streamDeleteVideo(uid)
    await admin
      .from('media_videos')
      .delete()
      .eq('property_id', args.propertyId)
      .eq('stream_uid', uid)
    return true
  }
  // R2-hosted file. Tenant guard: key must live under the property prefix.
  if (!args.key.startsWith(args.r2Prefix)) return false
  await r2DeleteObject(args.key)
  return true
}

export async function deleteMediaAction(args: {
  propertyId: string
  key: string
}) {
  const session = await requireOrgUser()
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

  revalidatePath('/media')
  revalidatePath('/dashboard')
}

const MAX_BULK_OPERATION = 500

export async function bulkDeleteMediaAction(args: {
  propertyId: string
  keys: string[]
}): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const session = await requireOrgUser()
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

  revalidatePath('/media')
  revalidatePath('/dashboard')
  return { ok: true, deleted: deletedKeys.length }
}

// ----------------------------------------------------------------------------
// Download — presigned GET (R2) or public MP4 (Stream)
// ----------------------------------------------------------------------------

export type DownloadUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

export async function presignDownloadAction(args: {
  propertyId: string
  key: string
  filename: string
}): Promise<DownloadUrlResult> {
  const session = await requireOrgUser()
  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return { ok: false, error: 'Property not found.' }

  const uid = streamUidFromKey(args.key)
  if (uid) {
    // Verify ownership: the Stream UID must belong to this property.
    const admin = createAdminClient()
    const { data } = await admin
      .from('media_videos')
      .select('stream_uid')
      .eq('property_id', args.propertyId)
      .eq('stream_uid', uid)
      .maybeSingle()
    if (!data) return { ok: false, error: 'Video not found.' }
    return { ok: true, url: streamMp4DownloadUrl(uid) }
  }

  if (!args.key.startsWith(property.r2_prefix)) {
    return { ok: false, error: 'File does not belong to this property.' }
  }
  const url = await r2PresignDownloadUrl(args.key, args.filename)
  return { ok: true, url }
}

// ----------------------------------------------------------------------------
// Stream — Direct Creator Upload finalize step.
// (The tus CREATE goes through the /api/media/stream-upload route handler,
// which proxies the Cloudflare API and inserts the media_videos row.)
// ----------------------------------------------------------------------------

/**
 * Browser calls this after the tus upload finishes. We pull the latest
 * status from Stream and flip the row to "ready" once Cloudflare reports
 * readyToStream — the catalog can then render the thumbnail / iframe.
 */
export async function finalizeStreamVideoUploadAction(args: {
  propertyId: string
  uid: string
}): Promise<{ ok: true; status: 'pending' | 'ready' | 'error' } | { ok: false; error: string }> {
  const session = await requireOrgUser()
  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return { ok: false, error: 'Property not found.' }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('media_videos')
    .select('stream_uid, status')
    .eq('property_id', args.propertyId)
    .eq('stream_uid', args.uid)
    .maybeSingle()
  if (!row) return { ok: false, error: 'Video not found.' }

  let video
  try {
    video = await streamGetVideo(args.uid)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Stream lookup failed' }
  }
  if (!video) return { ok: false, error: 'Stream returned no video.' }

  const nextStatus: 'pending' | 'ready' | 'error' =
    video.status === 'error'
      ? 'error'
      : video.readyToStream
        ? 'ready'
        : 'pending'

  await admin
    .from('media_videos')
    .update({
      status: nextStatus,
      duration_seconds: video.duration ? Math.round(video.duration) : null,
      ready_at: nextStatus === 'ready' ? new Date().toISOString() : null,
    })
    .eq('property_id', args.propertyId)
    .eq('stream_uid', args.uid)

  if (nextStatus === 'ready') {
    // Kick off MP4 build the first time the video transitions to ready,
    // so the catalog "Download" button has something to point at. The
    // build itself is async on Cloudflare's side; the static
    // /downloads/default.mp4 URL 404s until it lands.
    if (row.status !== 'ready') {
      try {
        await streamEnableMp4Download(args.uid)
      } catch (err) {
        // Non-fatal: the video still streams + has a thumbnail. We just
        // log so a misconfigured token surfaces in Vercel function logs
        // rather than silently breaking download.
        console.error('[stream] enable MP4 download failed', {
          uid: args.uid,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }
    revalidatePath('/media')
  }
  return { ok: true, status: nextStatus }
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
  const session = await requireOrgUser()
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
  const session = await requireOrgUser()
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
  revalidatePath('/media')
  return { ok: true, tags: updated }
}

export async function removeTagAction(args: {
  propertyId: string
  key: string
  tag: string
}): Promise<TagResult> {
  const session = await requireOrgUser()
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
  // If the exact key isn't taken, use it. Otherwise append "-2", "-3", ...
  // before the extension.
  const proposed = `${prefix}${filename}`
  if (!(await r2ObjectExists(proposed))) return proposed

  const dot = filename.lastIndexOf('.')
  const stem = dot === -1 ? filename : filename.slice(0, dot)
  const ext = dot === -1 ? '' : filename.slice(dot)

  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${prefix}${stem}-${n}${ext}`
    if (!(await r2ObjectExists(candidate))) return candidate
  }
  // Fallback (basically never reached): timestamp-suffixed.
  return `${prefix}${stem}-${Date.now()}${ext}`
}

function normalizeTag(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, '-')
  if (t.length === 0 || t.length > TAG_MAX_LENGTH) return null
  if (!TAG_RE.test(t)) return null
  return t
}
