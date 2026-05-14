'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireOrgUser } from '@/lib/auth/session'
import {
  r2DeleteObject,
  r2ObjectExists,
  r2PresignDownloadUrl,
  r2PresignPutUrl,
} from '@/lib/r2/upload'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ItDocumentCategory, ItDocumentFolder } from '@/lib/supabase/types'

// IT documents live under a hidden subprefix per scope. Per-property docs
// nest under the property's R2 prefix; org-wide docs (no property selected)
// nest under the org slug. Both are filtered out of the media catalog
// listing — see src/lib/r2/list.ts.
const DOCS_SUBPREFIX = '_it-docs/'

const DOCUMENT_CATEGORIES: ItDocumentCategory[] = [
  'contract',
  'runbook',
  'presentation',
  'manual',
  'network_diagram',
  'license',
  'warranty',
  'invoice',
  'policy',
  'other',
]

// Generous list — most contracts/decks/manuals fall in here. We deliberately
// don't allow generic application/octet-stream so a hostile client can't
// disguise a binary as a "document".
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'application/rtf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
])

const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024 // 100 MB
const MAX_TITLE_LENGTH = 200
const MAX_NOTES_LENGTH = 1000
const MAX_FOLDER_NAME_LENGTH = 80

const PRESIGN_LIMIT = { limit: 30, windowMs: 60_000 } as const

export type PresignResult =
  | { ok: true; key: string; url: string }
  | { ok: false; error: string }

/**
 * Step 1: authorize the upload, sanitize the filename, mint an R2 key under
 * the appropriate scope, and return a presigned PUT URL. The browser then
 * uploads directly to R2 (bypasses Vercel's 4.5 MB request body limit).
 */
export async function presignDocumentUploadAction(args: {
  propertyId: string | null
  filename: string
  contentType: string
  size: number
}): Promise<PresignResult> {
  const session = await requireOrgUser()

  const rl = checkRateLimit(`it-doc-presign:${session.userId}`, PRESIGN_LIMIT)
  if (!rl.ok) {
    return { ok: false, error: 'Too many uploads — slow down a moment.' }
  }

  if (!ALLOWED_MIME.has(args.contentType)) {
    return {
      ok: false,
      error:
        "That file type isn't allowed. Try PDF, Word, Excel, PowerPoint, or an image.",
    }
  }
  if (args.size <= 0) return { ok: false, error: 'Empty file.' }
  if (args.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: 'File exceeds 100 MB limit.' }
  }

  const safe = sanitizeFilename(args.filename)
  if (!safe) return { ok: false, error: 'Invalid filename.' }

  const scopePrefix = await resolveScopePrefix(session, args.propertyId)
  if (!scopePrefix) return { ok: false, error: 'Property not found.' }

  const key = await uniqueKey(`${scopePrefix}${DOCS_SUBPREFIX}`, safe)
  const url = await r2PresignPutUrl(key, args.contentType)
  return { ok: true, key, url }
}

/**
 * Step 2: after the browser PUT succeeds, persist the metadata row. We
 * verify the object actually landed in R2 so we never record a row for a
 * client that lied about completing the upload.
 */
export async function saveDocumentAction(args: {
  propertyId: string | null
  folderId: string | null
  key: string
  fileName: string
  contentType: string
  size: number
  title: string
  category: ItDocumentCategory
  expiresAt: string | null
  notes: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOrgUser()

  const title = args.title.trim().slice(0, MAX_TITLE_LENGTH)
  if (!title) return { ok: false, error: 'Give the document a title.' }
  if (!DOCUMENT_CATEGORIES.includes(args.category)) {
    return { ok: false, error: 'Pick a category.' }
  }

  const scopePrefix = await resolveScopePrefix(session, args.propertyId)
  if (!scopePrefix) return { ok: false, error: 'Property not found.' }
  const expectedPrefix = `${scopePrefix}${DOCS_SUBPREFIX}`
  if (!args.key.startsWith(expectedPrefix)) {
    // The client returned a key outside the scope it claimed — refuse.
    return { ok: false, error: 'Upload key does not match scope.' }
  }

  if (!(await r2ObjectExists(args.key))) {
    return { ok: false, error: "We couldn't find the upload in storage." }
  }

  const folderId = await resolveFolderId(session.organization.id, args.folderId)
  if (folderId === FOLDER_NOT_FOUND) {
    return { ok: false, error: 'Folder not found.' }
  }

  const expiresAt = args.expiresAt && /^\d{4}-\d{2}-\d{2}$/.test(args.expiresAt)
    ? args.expiresAt
    : null
  const notes = args.notes ? args.notes.slice(0, MAX_NOTES_LENGTH) : null

  const admin = createAdminClient()
  const { error } = await admin.from('it_documents').insert({
    org_id: session.organization.id,
    property_id: args.propertyId,
    folder_id: folderId,
    title,
    category: args.category,
    r2_key: args.key,
    file_name: args.fileName.slice(0, 200),
    content_type: args.contentType,
    size_bytes: Math.round(args.size),
    expires_at: expiresAt,
    notes,
    uploaded_by: session.userId,
    uploaded_by_email: session.email,
  })
  if (error) {
    // If the DB insert fails, drop the orphan R2 object so we don't leak
    // storage on a failed upload.
    await r2DeleteObject(args.key)
    return { ok: false, error: error.message }
  }

  revalidatePath('/it-hub')
  revalidatePath('/it-hub/documents')
  return { ok: true }
}

export type DownloadUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

export async function presignDocumentDownloadAction(args: {
  id: string
}): Promise<DownloadUrlResult> {
  const session = await requireOrgUser()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('it_documents')
    .select('r2_key, file_name, org_id')
    .eq('id', args.id)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Document not found.' }
  if (data.org_id !== session.organization.id) {
    return { ok: false, error: 'Not authorized.' }
  }
  const url = await r2PresignDownloadUrl(data.r2_key, data.file_name)
  return { ok: true, url }
}

export async function deleteDocumentAction(formData: FormData) {
  const session = await requireOrgUser()
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return

  const admin = createAdminClient()
  const { data } = await admin
    .from('it_documents')
    .select('r2_key, org_id')
    .eq('id', id)
    .maybeSingle()
  if (!data || data.org_id !== session.organization.id) return

  await r2DeleteObject(data.r2_key)
  await admin
    .from('it_documents')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)

  revalidatePath('/it-hub')
  revalidatePath('/it-hub/documents')
}

export type UpdateResult = { error?: string; success?: string }

export async function updateDocumentAction(
  _prev: UpdateResult,
  formData: FormData,
): Promise<UpdateResult> {
  const session = await requireOrgUser()
  const id = String(formData.get('id') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim().slice(0, MAX_TITLE_LENGTH)
  const category = String(formData.get('category') ?? '').trim() as ItDocumentCategory
  const expiresAtRaw = String(formData.get('expires_at') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim().slice(0, MAX_NOTES_LENGTH)
  const folderIdRaw = String(formData.get('folder_id') ?? '').trim()

  if (!id) return { error: 'Missing document.' }
  if (!title) return { error: 'Title is required.' }
  if (!DOCUMENT_CATEGORIES.includes(category)) {
    return { error: 'Pick a category.' }
  }
  const expiresAt =
    expiresAtRaw && /^\d{4}-\d{2}-\d{2}$/.test(expiresAtRaw)
      ? expiresAtRaw
      : null

  const folderId = await resolveFolderId(
    session.organization.id,
    folderIdRaw === '' ? null : folderIdRaw,
  )
  if (folderId === FOLDER_NOT_FOUND) return { error: 'Folder not found.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('it_documents')
    .update({
      title,
      category,
      folder_id: folderId,
      expires_at: expiresAt,
      notes: notes === '' ? null : notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', session.organization.id)
  if (error) return { error: error.message }

  revalidatePath('/it-hub/documents')
  return { success: 'Saved.' }
}

// ----------------------------------------------------------------------------
// Folder actions
// ----------------------------------------------------------------------------

export type FolderResult =
  | { ok: true; folder: ItDocumentFolder }
  | { ok: false; error: string }

export async function createFolderAction(args: {
  name: string
  parentId: string | null
}): Promise<FolderResult> {
  const session = await requireOrgUser()
  const name = args.name.trim().slice(0, MAX_FOLDER_NAME_LENGTH)
  if (!name) return { ok: false, error: 'Folder name is required.' }
  if (/[\\/]/.test(name)) {
    return { ok: false, error: "Folder names can't contain slashes." }
  }

  const parentId = await resolveFolderId(session.organization.id, args.parentId)
  if (parentId === FOLDER_NOT_FOUND) {
    return { ok: false, error: 'Parent folder not found.' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('it_document_folders')
    .insert({
      org_id: session.organization.id,
      parent_id: parentId,
      name,
      created_by: session.userId,
    })
    .select('*')
    .single()
  if (error) {
    // Surface the unique-name conflict in human terms.
    if (error.code === '23505') {
      return {
        ok: false,
        error: 'A folder with that name already exists here.',
      }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/it-hub/documents')
  return { ok: true, folder: data as ItDocumentFolder }
}

export async function renameFolderAction(args: {
  id: string
  name: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOrgUser()
  const name = args.name.trim().slice(0, MAX_FOLDER_NAME_LENGTH)
  if (!name) return { ok: false, error: 'Folder name is required.' }
  if (/[\\/]/.test(name)) {
    return { ok: false, error: "Folder names can't contain slashes." }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('it_document_folders')
    .update({ name })
    .eq('id', args.id)
    .eq('org_id', session.organization.id)
  if (error) {
    if (error.code === '23505') {
      return {
        ok: false,
        error: 'A folder with that name already exists here.',
      }
    }
    return { ok: false, error: error.message }
  }
  revalidatePath('/it-hub/documents')
  return { ok: true }
}

/**
 * Delete a folder. Subfolders cascade away (FK on delete cascade), and any
 * documents inside become unfiled (folder_id set null) rather than being
 * deleted with their files — losing actual binaries on a UI misclick would be
 * far worse than leaving a few documents at the root.
 */
export async function deleteFolderAction(formData: FormData) {
  const session = await requireOrgUser()
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return

  const admin = createAdminClient()
  await admin
    .from('it_document_folders')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)

  revalidatePath('/it-hub/documents')
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

type ScopeSession = Awaited<ReturnType<typeof requireOrgUser>>

async function resolveScopePrefix(
  session: ScopeSession,
  propertyId: string | null,
): Promise<string | null> {
  if (!propertyId) {
    // Org-wide docs land under the org's namespace.
    const slug = session.organization.slug
    return slug.endsWith('/') ? slug : `${slug}/`
  }
  const property = session.properties.find((p) => p.id === propertyId)
  if (!property) return null
  return property.r2_prefix.endsWith('/')
    ? property.r2_prefix
    : `${property.r2_prefix}/`
}

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

const FOLDER_NOT_FOUND = Symbol('FOLDER_NOT_FOUND')

/**
 * Validates that a folder belongs to this org (callers pass IDs from the URL
 * or form input, so we can't trust them). Returns null for the root, the
 * verified id for a real folder, or FOLDER_NOT_FOUND if the id is bogus.
 */
async function resolveFolderId(
  orgId: string,
  folderId: string | null,
): Promise<string | null | typeof FOLDER_NOT_FOUND> {
  if (!folderId) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('it_document_folders')
    .select('id')
    .eq('id', folderId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!data) return FOLDER_NOT_FOUND
  return data.id as string
}

async function uniqueKey(prefix: string, filename: string): Promise<string> {
  const proposed = `${prefix}${filename}`
  if (!(await r2ObjectExists(proposed))) return proposed
  const dot = filename.lastIndexOf('.')
  const stem = dot === -1 ? filename : filename.slice(0, dot)
  const ext = dot === -1 ? '' : filename.slice(dot)
  const suffix = randomBytes(4).toString('hex')
  return `${prefix}${stem}-${suffix}${ext}`
}
