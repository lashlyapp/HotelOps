'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ArrivalInfoItem,
  ArrivalMenuGroup,
  ArrivalMenuItem,
  ArrivalPage,
  ArrivalQuickInfoEntry,
  ArrivalSection,
  ArrivalSectionBody,
  ArrivalSectionKind,
} from '@/lib/supabase/types'
import { arrivalCacheTag } from './_lib/cache-tags'
import { SECTION_KINDS, bodyShapeForKind } from './_lib/labels'

export type ActionResult = { error?: string; success?: string }

function trim(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}
function trimOrNull(value: FormDataEntryValue | null): string | null {
  const v = trim(value)
  return v === '' ? null : v
}
function uuid(): string {
  // Per-item ids inside the JSONB body. We don't need cryptographic
  // unpredictability — they just have to be stable as the operator
  // reorders/edits items.
  return randomBytes(9).toString('base64url')
}

async function loadPage(orgId: string, propertyId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('arrival_pages')
    .select('*')
    .eq('property_id', propertyId)
    .eq('org_id', orgId)
    .maybeSingle()
  return (data as ArrivalPage | null) ?? null
}

async function ensurePropertyInOrg(
  orgId: string,
  propertyId: string,
): Promise<{ id: string; slug: string } | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('properties')
    .select('id, slug')
    .eq('id', propertyId)
    .eq('org_id', orgId)
    .maybeSingle()
  return (data as { id: string; slug: string } | null) ?? null
}

function busts(slug: string | null) {
  if (slug) {
    revalidateTag(arrivalCacheTag(slug), 'max')
    revalidatePath(`/a/${slug}`)
  }
  revalidatePath('/arrival')
}

// ----------------------------------------------------------------------------
// Create / upsert page
// ----------------------------------------------------------------------------
export async function ensureArrivalPageAction(args: {
  propertyId: string
}): Promise<{ ok: true; pageId: string } | { ok: false; error: string }> {
  const session = await requireOrgUser({ write: true })
  const property = await ensurePropertyInOrg(
    session.organization.id,
    args.propertyId,
  )
  if (!property) return { ok: false, error: 'Property not found.' }
  const existing = await loadPage(session.organization.id, property.id)
  if (existing) return { ok: true, pageId: existing.id }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('arrival_pages')
    .insert({
      org_id: session.organization.id,
      property_id: property.id,
      public_slug: property.slug,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  busts(property.slug)
  return { ok: true, pageId: data.id }
}

// ----------------------------------------------------------------------------
// Save page-level fields (welcome, quick info, brand color, …)
// ----------------------------------------------------------------------------
export async function savePageAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  void prev
  const propertyId = trim(formData.get('property_id'))
  const property = await ensurePropertyInOrg(
    session.organization.id,
    propertyId,
  )
  if (!property) return { error: 'Property not found.' }

  const slug = trim(formData.get('public_slug')) || property.slug
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return { error: 'Slug must be lowercase letters, numbers, and hyphens.' }
  }
  const welcomeHeading = trimOrNull(formData.get('welcome_heading'))
  if (welcomeHeading && welcomeHeading.length > 120) {
    return { error: 'Welcome heading is too long (max 120 chars).' }
  }
  const welcomeBody = trimOrNull(formData.get('welcome_body'))
  if (welcomeBody && welcomeBody.length > 2000) {
    return { error: 'Welcome body is too long (max 2000 chars).' }
  }
  const brandColor = trimOrNull(formData.get('brand_color'))
  if (brandColor && !/^#[0-9a-fA-F]{3,8}$/.test(brandColor)) {
    return { error: 'Brand color must be a hex value like #0F172A.' }
  }

  // Quick info: parallel `quick_info_label[]` and `quick_info_value[]` arrays.
  const labels = formData.getAll('quick_info_label').map((v) => String(v).trim())
  const values = formData.getAll('quick_info_value').map((v) => String(v).trim())
  const quickInfo: ArrivalQuickInfoEntry[] = []
  for (let i = 0; i < Math.min(labels.length, values.length, 12); i += 1) {
    const label = labels[i]!
    const value = values[i]!
    if (!label && !value) continue
    if (label.length > 60 || value.length > 200) {
      return { error: 'Quick info entries are too long (60/200 char limits).' }
    }
    quickInfo.push({ label, value })
  }

  const hiddenNetworkIds = formData
    .getAll('hidden_network_id')
    .map((v) => String(v))
    .filter((v) => /^[0-9a-f-]{36}$/i.test(v))

  const admin = createAdminClient()
  const update = {
    public_slug: slug,
    brand_color: brandColor,
    welcome_heading: welcomeHeading,
    welcome_body: welcomeBody,
    quick_info: quickInfo,
    checkout_time: trimOrNull(formData.get('checkout_time')),
    parking: trimOrNull(formData.get('parking')),
    pet_policy: trimOrNull(formData.get('pet_policy')),
    smoking_policy: trimOrNull(formData.get('smoking_policy')),
    contact_phone: trimOrNull(formData.get('contact_phone')),
    hidden_network_ids: hiddenNetworkIds,
    updated_at: new Date().toISOString(),
  }

  const existing = await loadPage(session.organization.id, property.id)
  if (!existing) {
    const { error } = await admin.from('arrival_pages').insert({
      org_id: session.organization.id,
      property_id: property.id,
      ...update,
    })
    if (error) return { error: humanizeSlugError(error.message) }
  } else {
    const { error } = await admin
      .from('arrival_pages')
      .update(update)
      .eq('id', existing.id)
      .eq('org_id', session.organization.id)
    if (error) return { error: humanizeSlugError(error.message) }
  }

  // Bust caches on both the old and new slugs in case the slug changed.
  if (existing && existing.public_slug !== slug) {
    busts(existing.public_slug)
  }
  busts(slug)
  return { success: 'Saved.' }
}

function humanizeSlugError(message: string): string {
  if (message.toLowerCase().includes('arrival_pages_public_slug_idx')) {
    return 'That slug is already in use. Pick another.'
  }
  return message
}

// ----------------------------------------------------------------------------
// Publish — marks published_at and busts caches. (We currently render the
// public page from arrival_pages directly; published_at is recorded for
// auditing and the v1.1 draft/published split.)
// ----------------------------------------------------------------------------
export async function publishPageAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  void prev
  const pageId = trim(formData.get('page_id'))
  const admin = createAdminClient()
  const { data: page } = await admin
    .from('arrival_pages')
    .select('*')
    .eq('id', pageId)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!page) return { error: 'Arrival page not found.' }

  await admin
    .from('arrival_pages')
    .update({
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', pageId)
    .eq('org_id', session.organization.id)
  busts(page.public_slug)
  return { success: 'Published.' }
}

// ----------------------------------------------------------------------------
// Sections — create, update title/order/published, delete
// ----------------------------------------------------------------------------
export async function createSectionAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  void prev
  const pageId = trim(formData.get('page_id'))
  const kind = trim(formData.get('kind')) as ArrivalSectionKind
  const title = trim(formData.get('title'))
  if (!(SECTION_KINDS as string[]).includes(kind)) {
    return { error: 'Pick a section type.' }
  }
  if (!title) return { error: 'Give the section a title.' }
  if (title.length > 120) return { error: 'Title is too long.' }

  const admin = createAdminClient()
  const { data: page } = await admin
    .from('arrival_pages')
    .select('id, public_slug')
    .eq('id', pageId)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!page) return { error: 'Arrival page not found.' }

  const tail = await admin
    .from('arrival_sections')
    .select('sort_order')
    .eq('page_id', pageId)
    .order('sort_order', { ascending: false })
    .limit(1)
  const nextOrder = (tail.data?.[0]?.sort_order ?? -1) + 1

  const body: ArrivalSectionBody =
    bodyShapeForKind(kind) === 'groups'
      ? { groups: [{ id: uuid(), name: 'Breakfast', items: [] }] }
      : { items: [] }

  const { error } = await admin.from('arrival_sections').insert({
    page_id: pageId,
    org_id: session.organization.id,
    kind,
    title,
    body,
    sort_order: nextOrder,
    is_published: true,
  })
  if (error) return { error: error.message }
  busts(page.public_slug)
  return { success: 'Section added.' }
}

export async function updateSectionTitleAction(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  void prev
  const id = trim(formData.get('id'))
  const title = trim(formData.get('title'))
  const isPublished = formData.get('is_published') === 'on'
  if (!title) return { error: 'Title is required.' }
  const admin = createAdminClient()
  const { data: section } = await admin
    .from('arrival_sections')
    .select('*, arrival_pages(public_slug)')
    .eq('id', id)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!section) return { error: 'Section not found.' }
  const { error } = await admin
    .from('arrival_sections')
    .update({
      title,
      is_published: isPublished,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', session.organization.id)
  if (error) return { error: error.message }
  const slug = (section as unknown as { arrival_pages: { public_slug: string } | null })
    .arrival_pages?.public_slug
  busts(slug ?? null)
  return { success: 'Saved.' }
}

export async function reorderSectionAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  const direction = trim(formData.get('direction'))
  if (direction !== 'up' && direction !== 'down') return
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('arrival_sections')
    .select('*')
    .eq('id', id)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!row) return
  const { data: siblings } = await admin
    .from('arrival_sections')
    .select('id, sort_order')
    .eq('page_id', row.page_id)
    .order('sort_order', { ascending: true })
  const list = siblings ?? []
  const idx = list.findIndex((s) => s.id === id)
  if (idx < 0) return
  const swap = direction === 'up' ? idx - 1 : idx + 1
  if (swap < 0 || swap >= list.length) return
  const a = list[idx]!
  const b = list[swap]!
  await admin
    .from('arrival_sections')
    .update({ sort_order: b.sort_order })
    .eq('id', a.id)
  await admin
    .from('arrival_sections')
    .update({ sort_order: a.sort_order })
    .eq('id', b.id)
  const { data: page } = await admin
    .from('arrival_pages')
    .select('public_slug')
    .eq('id', row.page_id)
    .maybeSingle()
  busts(page?.public_slug ?? null)
}

export async function deleteSectionAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('arrival_sections')
    .select('page_id')
    .eq('id', id)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!row) return
  await admin
    .from('arrival_sections')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)
  const { data: page } = await admin
    .from('arrival_pages')
    .select('public_slug')
    .eq('id', row.page_id)
    .maybeSingle()
  busts(page?.public_slug ?? null)
}

// ----------------------------------------------------------------------------
// Section body — info items (dining/amenity/event/marketing)
// ----------------------------------------------------------------------------
export type InfoItemInput = Partial<Omit<ArrivalInfoItem, 'id'>>

export async function addInfoItemAction(args: {
  sectionId: string
  item: InfoItemInput
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOrgUser({ write: true })
  const cleaned = sanitizeInfoItem(args.item)
  if (!cleaned) return { ok: false, error: 'Title is required.' }
  return await mutateInfoItems(
    session.organization.id,
    args.sectionId,
    (items) => [...items, { id: uuid(), ...cleaned }],
  )
}

export async function updateInfoItemAction(args: {
  sectionId: string
  itemId: string
  item: InfoItemInput
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOrgUser({ write: true })
  const cleaned = sanitizeInfoItem(args.item)
  if (!cleaned) return { ok: false, error: 'Title is required.' }
  return await mutateInfoItems(
    session.organization.id,
    args.sectionId,
    (items) =>
      items.map((it) =>
        it.id === args.itemId ? { ...it, ...cleaned } : it,
      ),
  )
}

export async function deleteInfoItemAction(args: {
  sectionId: string
  itemId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOrgUser({ write: true })
  return await mutateInfoItems(
    session.organization.id,
    args.sectionId,
    (items) => items.filter((it) => it.id !== args.itemId),
  )
}

function sanitizeInfoItem(input: InfoItemInput): Omit<ArrivalInfoItem, 'id'> | null {
  const title = (input.title ?? '').trim()
  if (!title || title.length > 200) return null
  const subtitle = (input.subtitle ?? '').trim().slice(0, 200) || null
  const body = (input.body ?? '').trim().slice(0, 2000) || null
  const hours = (input.hours ?? '').trim().slice(0, 200) || null
  const imageKey = (input.image_key ?? '').trim() || null
  const urlRaw = (input.url ?? '').trim() || null
  const url = urlRaw && /^https?:\/\//.test(urlRaw) ? urlRaw : null
  return { title, subtitle, body, hours, image_key: imageKey, url }
}

async function mutateInfoItems(
  orgId: string,
  sectionId: string,
  fn: (items: ArrivalInfoItem[]) => ArrivalInfoItem[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('arrival_sections')
    .select('*, arrival_pages(public_slug)')
    .eq('id', sectionId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!row) return { ok: false, error: 'Section not found.' }
  const section = row as unknown as ArrivalSection & {
    arrival_pages: { public_slug: string } | null
  }
  if ('groups' in section.body) {
    return { ok: false, error: 'Wrong section type.' }
  }
  const next = fn((section.body as { items: ArrivalInfoItem[] }).items)
  const { error } = await admin
    .from('arrival_sections')
    .update({ body: { items: next }, updated_at: new Date().toISOString() })
    .eq('id', sectionId)
    .eq('org_id', orgId)
  if (error) return { ok: false, error: error.message }
  busts(section.arrival_pages?.public_slug ?? null)
  return { ok: true }
}

// ----------------------------------------------------------------------------
// Section body — menu groups (restaurant / room service)
// ----------------------------------------------------------------------------
export async function addMenuGroupAction(args: {
  sectionId: string
  name: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOrgUser({ write: true })
  const name = args.name.trim().slice(0, 120)
  if (!name) return { ok: false, error: 'Group name required.' }
  return await mutateMenu(session.organization.id, args.sectionId, (groups) => [
    ...groups,
    { id: uuid(), name, items: [] },
  ])
}

export async function renameMenuGroupAction(args: {
  sectionId: string
  groupId: string
  name: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOrgUser({ write: true })
  const name = args.name.trim().slice(0, 120)
  if (!name) return { ok: false, error: 'Group name required.' }
  return await mutateMenu(session.organization.id, args.sectionId, (groups) =>
    groups.map((g) => (g.id === args.groupId ? { ...g, name } : g)),
  )
}

export async function deleteMenuGroupAction(args: {
  sectionId: string
  groupId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOrgUser({ write: true })
  return await mutateMenu(session.organization.id, args.sectionId, (groups) =>
    groups.filter((g) => g.id !== args.groupId),
  )
}

export type MenuItemInput = Partial<Omit<ArrivalMenuItem, 'id'>>

export async function addMenuItemAction(args: {
  sectionId: string
  groupId: string
  item: MenuItemInput
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOrgUser({ write: true })
  const cleaned = sanitizeMenuItem(args.item)
  if (!cleaned) return { ok: false, error: 'Item name is required.' }
  return await mutateMenu(session.organization.id, args.sectionId, (groups) =>
    groups.map((g) =>
      g.id === args.groupId
        ? { ...g, items: [...g.items, { id: uuid(), ...cleaned }] }
        : g,
    ),
  )
}

export async function updateMenuItemAction(args: {
  sectionId: string
  groupId: string
  itemId: string
  item: MenuItemInput
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOrgUser({ write: true })
  const cleaned = sanitizeMenuItem(args.item)
  if (!cleaned) return { ok: false, error: 'Item name is required.' }
  return await mutateMenu(session.organization.id, args.sectionId, (groups) =>
    groups.map((g) =>
      g.id === args.groupId
        ? {
            ...g,
            items: g.items.map((it) =>
              it.id === args.itemId ? { ...it, ...cleaned } : it,
            ),
          }
        : g,
    ),
  )
}

export async function deleteMenuItemAction(args: {
  sectionId: string
  groupId: string
  itemId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOrgUser({ write: true })
  return await mutateMenu(session.organization.id, args.sectionId, (groups) =>
    groups.map((g) =>
      g.id === args.groupId
        ? { ...g, items: g.items.filter((it) => it.id !== args.itemId) }
        : g,
    ),
  )
}

function sanitizeMenuItem(input: MenuItemInput): Omit<ArrivalMenuItem, 'id'> | null {
  const name = (input.name ?? '').trim()
  if (!name || name.length > 120) return null
  const description = (input.description ?? '').trim().slice(0, 500) || null
  const price = (input.price ?? '').trim().slice(0, 32) || null
  const imageKey = (input.image_key ?? '').trim() || null
  const diet = Array.isArray(input.diet)
    ? input.diet
        .filter((d): d is string => typeof d === 'string')
        .map((d) => d.trim().slice(0, 20))
        .filter((d) => d.length > 0)
        .slice(0, 8)
    : undefined
  return { name, description, price, image_key: imageKey, diet }
}

async function mutateMenu(
  orgId: string,
  sectionId: string,
  fn: (groups: ArrivalMenuGroup[]) => ArrivalMenuGroup[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('arrival_sections')
    .select('*, arrival_pages(public_slug)')
    .eq('id', sectionId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!row) return { ok: false, error: 'Section not found.' }
  const section = row as unknown as ArrivalSection & {
    arrival_pages: { public_slug: string } | null
  }
  if (!('groups' in section.body)) {
    return { ok: false, error: 'Wrong section type.' }
  }
  const next = fn((section.body as { groups: ArrivalMenuGroup[] }).groups)
  const { error } = await admin
    .from('arrival_sections')
    .update({ body: { groups: next }, updated_at: new Date().toISOString() })
    .eq('id', sectionId)
    .eq('org_id', orgId)
  if (error) return { ok: false, error: error.message }
  busts(section.arrival_pages?.public_slug ?? null)
  return { ok: true }
}

// ----------------------------------------------------------------------------
// Owner-only delete page
// ----------------------------------------------------------------------------
export async function deletePageAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  if (session.profile.role !== 'org_owner') {
    redirect('/arrival?error=not_authorized')
  }
  const id = trim(formData.get('id'))
  const admin = createAdminClient()
  const { data: page } = await admin
    .from('arrival_pages')
    .select('public_slug')
    .eq('id', id)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  await admin
    .from('arrival_pages')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)
  busts(page?.public_slug ?? null)
  redirect('/arrival')
}
