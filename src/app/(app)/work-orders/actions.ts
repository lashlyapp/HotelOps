'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireOrgUser } from '@/lib/auth/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { r2DeleteObject, r2PresignPutUrl } from '@/lib/r2/upload'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  WorkOrder,
  WorkOrderActivityKind,
  WorkOrderAttachmentKind,
  WorkOrderAttachmentPhase,
  WorkOrderCategory,
  WorkOrderPriority,
  WorkOrderStatus,
} from '@/lib/supabase/types'
import { CATEGORIES, PRIORITIES, STATUSES } from './_lib/labels'
import { nextWorkOrderReference } from './_lib/reference'

export type ActionResult = { error?: string; success?: string }

// ----------------------------------------------------------------------------
// Allowed media for work order attachments. Tighter than /media — we only want
// photo + short video evidence, not the full creative-asset surface.
// ----------------------------------------------------------------------------
const PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm'])
const MAX_PHOTO_BYTES = 10 * 1024 * 1024 // 10 MB — fits single-PUT upload path; modern phones encode well below.
const MAX_VIDEO_BYTES = 50 * 1024 * 1024 // 50 MB — ~15s at 1080p/30fps. Encourages "snap, don't film"; multipart deferred to v1.1.
const MAX_POSTER_BYTES = 5 * 1024 * 1024

const PRESIGN_LIMIT = { limit: 60, windowMs: 60_000 } as const

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function trim(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function trimOrNull(value: FormDataEntryValue | null): string | null {
  const v = trim(value)
  return v === '' ? null : v
}

function isStatus(v: string): v is WorkOrderStatus {
  return (STATUSES as string[]).includes(v)
}
function isPriority(v: string): v is WorkOrderPriority {
  return (PRIORITIES as string[]).includes(v)
}
function isCategory(v: string): v is WorkOrderCategory {
  return (CATEGORIES as string[]).includes(v)
}

async function ensurePropertyInOrg(
  orgId: string,
  propertyId: string,
): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .eq('org_id', orgId)
    .maybeSingle()
  return !!data
}

async function loadWorkOrderForOrg(
  orgId: string,
  workOrderId: string,
): Promise<WorkOrder | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('work_orders')
    .select('*')
    .eq('id', workOrderId)
    .eq('org_id', orgId)
    .maybeSingle()
  return (data as WorkOrder | null) ?? null
}

function revalidateWorkOrder(workOrderId: string) {
  revalidatePath('/work-orders')
  revalidatePath(`/work-orders/${workOrderId}`)
}

async function logActivity(args: {
  workOrderId: string
  orgId: string
  kind: WorkOrderActivityKind
  from?: string | null
  to?: string | null
  note?: string | null
  actorId: string | null
  actorEmail: string | null
}) {
  const admin = createAdminClient()
  await admin.from('work_order_activity').insert({
    work_order_id: args.workOrderId,
    org_id: args.orgId,
    kind: args.kind,
    from_value: args.from ?? null,
    to_value: args.to ?? null,
    note: args.note ?? null,
    actor_id: args.actorId,
    actor_email: args.actorEmail,
  })
}

function sanitizeFilename(input: string): string {
  // Strip path components and anything that isn't a friendly basename
  // character. Length-cap so a 500-char iPhone filename can't blow up R2.
  const base = input.split('/').pop()?.split('\\').pop() ?? ''
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  if (!cleaned) return ''
  return cleaned.slice(0, 120)
}

function randomToken(bytes = 9): string {
  return randomBytes(bytes).toString('base64url')
}

// ----------------------------------------------------------------------------
// Capture upload (browser → R2 direct PUT)
// ----------------------------------------------------------------------------
export type PresignAttachmentResult =
  | {
      ok: true
      key: string
      url: string
      kind: WorkOrderAttachmentKind
      filename: string
    }
  | { ok: false; error: string }

/**
 * Presign a PUT for a work order attachment (photo or short video). The browser
 * uploads directly to R2 to bypass Vercel's 4.5 MB function body limit.
 *
 * Attachments live under `<property.r2_prefix>_work-orders/<work_order_id>/...` so
 * `/media` never sees them (see `src/lib/r2/list.ts` exclusion list).
 * `work_order_id` is supplied by the client — the row is created later by
 * `createWorkOrderAction`, but the storage key only needs to be stable, not
 * already-bound to a database row.
 */
export async function presignWorkOrderAttachmentAction(args: {
  propertyId: string
  workOrderId: string // client-generated UUID for new work orders; existing id for evidence-add.
  filename: string
  contentType: string
  size: number
  kind: WorkOrderAttachmentKind
}): Promise<PresignAttachmentResult> {
  const session = await requireOrgUser({ write: true })

  const rl = checkRateLimit(`work-orders-presign:${session.userId}`, PRESIGN_LIMIT)
  if (!rl.ok) {
    return { ok: false, error: 'Too many uploads — slow down a moment.' }
  }

  if (args.kind === 'photo') {
    if (!PHOTO_MIME.has(args.contentType)) {
      return { ok: false, error: 'That photo format is not supported.' }
    }
    if (args.size <= 0 || args.size > MAX_PHOTO_BYTES) {
      return { ok: false, error: 'Photo exceeds the 25 MB limit.' }
    }
  } else if (args.kind === 'video') {
    if (!VIDEO_MIME.has(args.contentType)) {
      return { ok: false, error: 'That video format is not supported.' }
    }
    if (args.size <= 0 || args.size > MAX_VIDEO_BYTES) {
      return { ok: false, error: 'Video exceeds the 200 MB limit.' }
    }
  } else {
    return { ok: false, error: 'Unknown attachment kind.' }
  }

  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return { ok: false, error: 'Property not found.' }

  // UUID shape only; we don't bind to a row yet.
  if (!/^[0-9a-fA-F-]{32,40}$/.test(args.workOrderId)) {
    return { ok: false, error: 'Invalid work order id.' }
  }

  const safe = sanitizeFilename(args.filename)
  if (!safe) return { ok: false, error: 'Invalid filename.' }

  const key = `${property.r2_prefix}_work-orders/${args.workOrderId}/${randomToken()}-${safe}`
  const url = await r2PresignPutUrl(key, args.contentType)
  return { ok: true, key, url, kind: args.kind, filename: safe }
}

/**
 * Presign the JPEG poster for a video attachment (companion to the
 * `cover-picker` flow on `/media`). Posters live next to the video under
 * the same work order's `_posters/` subprefix so the orphan-posters cron's
 * scan window — which only looks at the property root — won't touch
 * them, and `/media` already filters out the parent `_work-orders/`.
 */
export async function presignWorkOrderPosterAction(args: {
  propertyId: string
  workOrderId: string
  videoKey: string
  size: number
}): Promise<
  | { ok: true; posterKey: string; url: string }
  | { ok: false; error: string }
> {
  const session = await requireOrgUser({ write: true })
  const rl = checkRateLimit(`work-orders-presign:${session.userId}`, PRESIGN_LIMIT)
  if (!rl.ok) {
    return { ok: false, error: 'Too many uploads — slow down a moment.' }
  }
  const property = session.properties.find((p) => p.id === args.propertyId)
  if (!property) return { ok: false, error: 'Property not found.' }

  const expectedPrefix = `${property.r2_prefix}_work-orders/${args.workOrderId}/`
  if (!args.videoKey.startsWith(expectedPrefix)) {
    return { ok: false, error: 'Video does not belong to this work order.' }
  }
  if (args.size <= 0 || args.size > MAX_POSTER_BYTES) {
    return { ok: false, error: 'Invalid poster size.' }
  }

  const basename = args.videoKey.slice(expectedPrefix.length)
  const posterKey = `${expectedPrefix}_posters/${basename}.jpg`
  const url = await r2PresignPutUrl(posterKey, 'image/jpeg')
  return { ok: true, posterKey, url }
}

// ----------------------------------------------------------------------------
// Create
// ----------------------------------------------------------------------------
export type AttachmentInput = {
  kind: WorkOrderAttachmentKind
  r2Key: string
  posterKey?: string | null
  filename: string
  contentType: string
  sizeBytes: number
}

export type CreateWorkOrderInput = {
  id: string // client-supplied UUID so already-uploaded attachments line up.
  propertyId: string
  title: string
  description?: string | null
  category: WorkOrderCategory
  priority: WorkOrderPriority
  location?: string | null
  assigneeId?: string | null
  tags?: string[]
  attachments: AttachmentInput[]
}

export async function createWorkOrderAction(
  input: CreateWorkOrderInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await requireOrgUser({ write: true })

  if (!/^[0-9a-f-]{36}$/i.test(input.id)) {
    return { ok: false, error: 'Invalid work order id.' }
  }
  if (!input.propertyId) return { ok: false, error: 'Choose a property.' }
  if (!(await ensurePropertyInOrg(session.organization.id, input.propertyId))) {
    return { ok: false, error: 'Property not found.' }
  }
  const title = input.title.trim()
  if (!title) return { ok: false, error: 'Add a short title.' }
  if (title.length > 200) {
    return { ok: false, error: 'Title is too long (max 200 chars).' }
  }
  if (!isCategory(input.category)) {
    return { ok: false, error: 'Pick a category.' }
  }
  if (!isPriority(input.priority)) {
    return { ok: false, error: 'Pick a priority.' }
  }
  if (input.description && input.description.length > 4000) {
    return { ok: false, error: 'Description is too long (max 4000 chars).' }
  }

  const property = session.properties.find((p) => p.id === input.propertyId)
  if (!property) return { ok: false, error: 'Property not found.' }
  const propertyPrefix = property.r2_prefix
  const expectedPrefix = `${propertyPrefix}_work-orders/${input.id}/`

  for (const att of input.attachments) {
    if (!att.r2Key.startsWith(expectedPrefix)) {
      return {
        ok: false,
        error: 'An attachment key does not belong to this work order.',
      }
    }
    if (att.posterKey && !att.posterKey.startsWith(expectedPrefix)) {
      return { ok: false, error: 'A poster key does not belong to this work order.' }
    }
  }

  // Validate assignee belongs to the org.
  let assigneeId: string | null = null
  if (input.assigneeId) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('id', input.assigneeId)
      .eq('org_id', session.organization.id)
      .maybeSingle()
    if (!data) {
      return { ok: false, error: 'Assignee is not in this organization.' }
    }
    assigneeId = input.assigneeId
  }

  const reference = await nextWorkOrderReference(input.propertyId)
  const admin = createAdminClient()

  const insertWorkOrder = await admin
    .from('work_orders')
    .insert({
      id: input.id,
      org_id: session.organization.id,
      property_id: input.propertyId,
      reference,
      title,
      description: trimOrNull(input.description ?? '') ?? null,
      status: 'open',
      priority: input.priority,
      category: input.category,
      location: trimOrNull(input.location ?? '') ?? null,
      assignee_id: assigneeId,
      created_by: session.userId,
      created_by_email: session.email,
    })
    .select('id')
    .single()
  if (insertWorkOrder.error) {
    // Clean up any uploaded R2 objects so we don't orphan storage.
    await cleanupAttachments(input.attachments)
    return { ok: false, error: insertWorkOrder.error.message }
  }

  if (input.attachments.length > 0) {
    const rows = input.attachments.map((a) => ({
      work_order_id: input.id,
      org_id: session.organization.id,
      kind: a.kind,
      r2_key: a.r2Key,
      poster_key: a.posterKey ?? null,
      filename: a.filename.slice(0, 200),
      content_type: a.contentType.slice(0, 120),
      size_bytes: Math.max(0, Math.floor(a.sizeBytes)),
      phase: 'before' as WorkOrderAttachmentPhase,
      uploaded_by: session.userId,
    }))
    const { error } = await admin.from('work_order_attachments').insert(rows)
    if (error) {
      // Soft-fail: the work order is already in. Surface a warning by way of activity.
      console.error('[work-orders] attachment insert failed', error)
    }
  }

  // Tag set (deduped, normalized).
  const tags = normalizeTags(input.tags ?? [])
  if (tags.length > 0) {
    await admin.from('work_order_tags').insert(
      tags.map((tag) => ({
        work_order_id: input.id,
        org_id: session.organization.id,
        tag,
      })),
    )
  }

  await logActivity({
    workOrderId: input.id,
    orgId: session.organization.id,
    kind: 'created',
    to: reference,
    actorId: session.userId,
    actorEmail: session.email,
  })

  revalidateWorkOrder(input.id)
  return { ok: true, id: input.id }
}

async function cleanupAttachments(attachments: AttachmentInput[]) {
  for (const a of attachments) {
    await r2DeleteObject(a.r2Key)
    if (a.posterKey) await r2DeleteObject(a.posterKey)
  }
}

function normalizeTags(input: string[]): string[] {
  const set = new Set<string>()
  for (const raw of input) {
    const v = raw.trim().toLowerCase().replace(/\s+/g, '-')
    if (v.length === 0) continue
    if (v.length > 48) continue
    set.add(v)
    if (set.size >= 12) break
  }
  return [...set]
}

// ----------------------------------------------------------------------------
// Transitions
// ----------------------------------------------------------------------------
export async function changeStatusAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  const workOrderId = trim(formData.get('work_order_id'))
  const next = trim(formData.get('status'))
  const force = trim(formData.get('force')) === '1'
  if (!isStatus(next)) return { error: 'Invalid status.' }
  void prev

  const workOrder = await loadWorkOrderForOrg(session.organization.id, workOrderId)
  if (!workOrder) return { error: 'Work order not found.' }
  if (workOrder.status === next) return { success: 'Already there.' }

  // "Done" requires at least one after-photo unless the user has owner
  // privileges and explicitly forces it. This is the proof-of-completion
  // habit the workflow is built around — skipping it should be loud.
  if (next === 'done') {
    const admin = createAdminClient()
    const { count } = await admin
      .from('work_order_attachments')
      .select('id', { count: 'exact', head: true })
      .eq('work_order_id', workOrderId)
      .eq('phase', 'after')
    if (!count || count < 1) {
      if (!(force && session.profile.role === 'org_owner')) {
        return {
          error:
            'Mark done needs an "after" photo or video. Upload one from the work order page first.',
        }
      }
    }
  }

  const admin = createAdminClient()
  const update: Record<string, unknown> = {
    status: next,
    updated_at: new Date().toISOString(),
  }
  if (next === 'done') {
    update.resolved_at = new Date().toISOString()
    update.resolved_by = session.userId
  } else if (workOrder.status === 'done') {
    update.resolved_at = null
    update.resolved_by = null
  }

  const { error } = await admin
    .from('work_orders')
    .update(update)
    .eq('id', workOrderId)
    .eq('org_id', session.organization.id)
  if (error) return { error: error.message }

  await logActivity({
    workOrderId,
    orgId: session.organization.id,
    kind:
      next === 'done' && force && session.profile.role === 'org_owner'
        ? 'forced_done'
        : 'status',
    from: workOrder.status,
    to: next,
    actorId: session.userId,
    actorEmail: session.email,
  })

  revalidateWorkOrder(workOrderId)
  return { success: `Moved to ${next.replace('_', ' ')}.` }
}

export async function changePriorityAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  const workOrderId = trim(formData.get('work_order_id'))
  const next = trim(formData.get('priority'))
  if (!isPriority(next)) return { error: 'Invalid priority.' }
  void prev
  const workOrder = await loadWorkOrderForOrg(session.organization.id, workOrderId)
  if (!workOrder) return { error: 'Work order not found.' }
  if (workOrder.priority === next) return { success: 'No change.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('work_orders')
    .update({ priority: next, updated_at: new Date().toISOString() })
    .eq('id', workOrderId)
    .eq('org_id', session.organization.id)
  if (error) return { error: error.message }
  await logActivity({
    workOrderId,
    orgId: session.organization.id,
    kind: 'priority',
    from: workOrder.priority,
    to: next,
    actorId: session.userId,
    actorEmail: session.email,
  })
  revalidateWorkOrder(workOrderId)
  return { success: 'Priority updated.' }
}

export async function changeAssigneeAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  const workOrderId = trim(formData.get('work_order_id'))
  const raw = trim(formData.get('assignee_id'))
  const nextId = raw === '' ? null : raw
  void prev
  const workOrder = await loadWorkOrderForOrg(session.organization.id, workOrderId)
  if (!workOrder) return { error: 'Work order not found.' }

  if (nextId) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('id', nextId)
      .eq('org_id', session.organization.id)
      .maybeSingle()
    if (!data) return { error: 'Assignee is not in this organization.' }
  }

  if ((workOrder.assignee_id ?? null) === nextId) return { success: 'No change.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('work_orders')
    .update({ assignee_id: nextId, updated_at: new Date().toISOString() })
    .eq('id', workOrderId)
    .eq('org_id', session.organization.id)
  if (error) return { error: error.message }

  await logActivity({
    workOrderId,
    orgId: session.organization.id,
    kind: nextId ? 'assigned' : 'unassigned',
    from: workOrder.assignee_id,
    to: nextId,
    actorId: session.userId,
    actorEmail: session.email,
  })
  revalidateWorkOrder(workOrderId)
  return { success: nextId ? 'Assignee updated.' : 'Unassigned.' }
}

// ----------------------------------------------------------------------------
// Comments
// ----------------------------------------------------------------------------
export async function addCommentAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  const workOrderId = trim(formData.get('work_order_id'))
  const body = trim(formData.get('body'))
  void prev
  if (!body) return { error: 'Write something.' }
  if (body.length > 2000) return { error: 'Comment is too long.' }
  const workOrder = await loadWorkOrderForOrg(session.organization.id, workOrderId)
  if (!workOrder) return { error: 'Work order not found.' }

  const admin = createAdminClient()
  const { error } = await admin.from('work_order_comments').insert({
    work_order_id: workOrderId,
    org_id: session.organization.id,
    body,
    author_id: session.userId,
    author_email: session.email,
  })
  if (error) return { error: error.message }

  await logActivity({
    workOrderId,
    orgId: session.organization.id,
    kind: 'comment',
    actorId: session.userId,
    actorEmail: session.email,
  })

  revalidateWorkOrder(workOrderId)
  return { success: 'Comment posted.' }
}

// ----------------------------------------------------------------------------
// Evidence — add attachments to an existing work order (progress / after photos)
// ----------------------------------------------------------------------------
export type AddEvidenceInput = {
  workOrderId: string
  phase: WorkOrderAttachmentPhase
  attachments: AttachmentInput[]
}

export async function addEvidenceAction(
  input: AddEvidenceInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOrgUser({ write: true })
  if (!['before', 'progress', 'after'].includes(input.phase)) {
    return { ok: false, error: 'Invalid phase.' }
  }
  const workOrder = await loadWorkOrderForOrg(session.organization.id, input.workOrderId)
  if (!workOrder) return { ok: false, error: 'Work order not found.' }
  if (input.attachments.length === 0) {
    return { ok: false, error: 'Pick a photo or video first.' }
  }
  const property = session.properties.find((p) => p.id === workOrder.property_id)
  if (!property) return { ok: false, error: 'Property not found.' }
  const expectedPrefix = `${property.r2_prefix}_work-orders/${workOrder.id}/`
  for (const a of input.attachments) {
    if (!a.r2Key.startsWith(expectedPrefix)) {
      return { ok: false, error: 'Attachment key does not belong to this work order.' }
    }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('work_order_attachments').insert(
    input.attachments.map((a) => ({
      work_order_id: workOrder.id,
      org_id: session.organization.id,
      kind: a.kind,
      r2_key: a.r2Key,
      poster_key: a.posterKey ?? null,
      filename: a.filename.slice(0, 200),
      content_type: a.contentType.slice(0, 120),
      size_bytes: Math.max(0, Math.floor(a.sizeBytes)),
      phase: input.phase,
      uploaded_by: session.userId,
    })),
  )
  if (error) return { ok: false, error: error.message }

  await logActivity({
    workOrderId: workOrder.id,
    orgId: session.organization.id,
    kind: 'attachment',
    to: input.phase,
    actorId: session.userId,
    actorEmail: session.email,
  })

  revalidateWorkOrder(workOrder.id)
  return { ok: true }
}

export async function deleteAttachmentAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('work_order_attachments')
    .select('*')
    .eq('id', id)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!row) return

  await admin
    .from('work_order_attachments')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)
  await r2DeleteObject(row.r2_key)
  if (row.poster_key) await r2DeleteObject(row.poster_key)
  revalidateWorkOrder(row.work_order_id)
}

// ----------------------------------------------------------------------------
// Delete work order — owner only, hard delete with R2 cleanup.
// ----------------------------------------------------------------------------
export async function deleteWorkOrderAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  if (session.profile.role !== 'org_owner') {
    redirect('/work-orders?error=not_authorized')
  }
  const id = trim(formData.get('id'))
  const workOrder = await loadWorkOrderForOrg(session.organization.id, id)
  if (!workOrder) redirect('/work-orders?error=not_found')

  const admin = createAdminClient()
  const { data: attachments } = await admin
    .from('work_order_attachments')
    .select('r2_key, poster_key')
    .eq('work_order_id', workOrder.id)
    .eq('org_id', session.organization.id)

  await admin
    .from('work_orders')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)

  for (const a of attachments ?? []) {
    if (a.r2_key) await r2DeleteObject(a.r2_key)
    if (a.poster_key) await r2DeleteObject(a.poster_key)
  }

  revalidatePath('/work-orders')
  redirect('/work-orders')
}
