'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgUser } from '@/lib/auth/session'
import {
  r2DeleteObject,
  r2ObjectExists,
  r2PresignPutUrl,
} from '@/lib/r2/upload'
import { createAdminClient } from '@/lib/supabase/admin'

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
  'application/pdf',
])
const MAX_FILE_BYTES = 200 * 1024 * 1024 // 200 MB

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
    return { ok: false, error: 'File exceeds 200 MB limit.' }
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
// Delete a media file
// ----------------------------------------------------------------------------

export async function deleteMediaAction(args: {
  propertyId: string
  key: string
}) {
  const session = await requireOrgUser()
  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return

  // Make sure the key is under the caller's property prefix so they can't
  // delete another tenant's files by passing an arbitrary key.
  if (!args.key.startsWith(property.r2_prefix)) return

  await r2DeleteObject(args.key)

  // Drop any tag rows so they don't linger.
  const admin = createAdminClient()
  await admin
    .from('media_tags')
    .delete()
    .eq('property_id', args.propertyId)
    .eq('file_key', args.key)

  revalidatePath('/media')
  revalidatePath('/dashboard')
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
