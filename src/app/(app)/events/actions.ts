'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  EventLineItem,
  EventLineSection,
  EventPaymentMethod,
  EventStatus,
  EventType,
} from '@/lib/supabase/types'
import { computeTotals } from './_lib/money'

export type ActionResult = { error?: string; success?: string }

const EVENT_TYPES: EventType[] = [
  'wedding',
  'corporate',
  'social',
  'catering',
  'meeting',
  'other',
]
const EVENT_STATUSES: EventStatus[] = [
  'inquiry',
  'tentative',
  'proposal_sent',
  'definite',
  'in_progress',
  'completed',
  'cancelled',
  'lost',
]
const LINE_SECTIONS: EventLineSection[] = [
  'venue',
  'food',
  'beverage',
  'av',
  'staffing',
  'rentals',
  'other',
]
const PAYMENT_METHODS: EventPaymentMethod[] = [
  'check',
  'cash',
  'ach',
  'wire',
  'card',
  'other',
]

function trim(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}
function trimOrNull(value: FormDataEntryValue | null): string | null {
  const v = trim(value)
  return v === '' ? null : v
}
function intOrNull(value: FormDataEntryValue | null): number | null {
  const v = trim(value)
  if (v === '') return null
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}
function dollarsToCents(value: FormDataEntryValue | null): number {
  const v = trim(value)
  if (v === '') return 0
  const n = Number.parseFloat(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}
function pctOrZero(value: FormDataEntryValue | null): number {
  const v = trim(value)
  if (v === '') return 0
  const n = Number.parseFloat(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
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

async function loadEventForOrg(orgId: string, eventId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select('*')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data
}

function revalidateEvent(eventId: string) {
  revalidatePath('/events')
  revalidatePath(`/events/${eventId}`)
}

async function logActivity(
  eventId: string,
  orgId: string,
  kind: string,
  message: string,
  actor: { id: string | null; label: string | null },
) {
  const admin = createAdminClient()
  await admin.from('event_activity').insert({
    event_id: eventId,
    org_id: orgId,
    kind,
    message,
    actor_id: actor.id,
    actor_label: actor.label,
  })
}

// Recompute and persist subtotal/total based on the current line items and
// the rates stored on the event. Called after every line-item write.
async function recomputeTotals(eventId: string, orgId: string) {
  const admin = createAdminClient()
  const { data: ev } = await admin
    .from('events')
    .select('service_charge_pct, tax_pct')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!ev) return
  const { data: lines } = await admin
    .from('event_line_items')
    .select('quantity, unit_price_cents, taxable, service_chargeable')
    .eq('event_id', eventId)
  const totals = computeTotals(
    (lines ?? []) as Pick<
      EventLineItem,
      'quantity' | 'unit_price_cents' | 'taxable' | 'service_chargeable'
    >[],
    Number(ev.service_charge_pct ?? 0),
    Number(ev.tax_pct ?? 0),
  )
  await admin
    .from('events')
    .update({
      subtotal_cents: totals.subtotal_cents,
      total_cents: totals.total_cents,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .eq('org_id', orgId)
}

// Generate the next per-org reference like "EVT-0042". Race-tolerant enough
// for v1 — collisions hit the unique constraint and we'd retry once.
async function nextReference(orgId: string): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select('reference')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
  const last = data?.[0]?.reference ?? ''
  const m = last.match(/^EVT-(\d+)$/)
  const n = m ? Number.parseInt(m[1], 10) + 1 : 1
  return `EVT-${String(n).padStart(4, '0')}`
}

function randomToken(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

// ----------------------------------------------------------------------------
// Spaces
// ----------------------------------------------------------------------------
export async function saveSpaceAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  const propertyId = trim(formData.get('property_id'))
  const name = trim(formData.get('name'))

  if (!propertyId) return { error: 'Choose a property.' }
  if (!name) return { error: 'Give the space a name.' }
  if (!(await ensurePropertyInOrg(session.organization.id, propertyId))) {
    return { error: 'Property not found.' }
  }

  const row = {
    org_id: session.organization.id,
    property_id: propertyId,
    name,
    capacity_seated: intOrNull(formData.get('capacity_seated')),
    capacity_standing: intOrNull(formData.get('capacity_standing')),
    hourly_rate_cents: dollarsToCents(formData.get('hourly_rate')) || null,
    flat_rate_cents: dollarsToCents(formData.get('flat_rate')) || null,
    notes: trimOrNull(formData.get('notes')),
    is_active: formData.get('is_active') !== 'off',
    updated_at: new Date().toISOString(),
  }

  const admin = createAdminClient()
  if (id) {
    const { error } = await admin
      .from('event_spaces')
      .update(row)
      .eq('id', id)
      .eq('org_id', session.organization.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await admin.from('event_spaces').insert(row)
    if (error) return { error: error.message }
  }

  revalidatePath('/events/spaces')
  return { success: id ? 'Space updated.' : 'Space added.' }
}

export async function deleteSpaceAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  if (!id) return
  const admin = createAdminClient()
  await admin
    .from('event_spaces')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)
  revalidatePath('/events/spaces')
}

// ----------------------------------------------------------------------------
// Events: create / update / delete / status
// ----------------------------------------------------------------------------
export async function createEventAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  const propertyId = trim(formData.get('property_id'))
  const name = trim(formData.get('name'))
  const eventType = trim(formData.get('event_type')) as EventType

  if (!propertyId) return { error: 'Choose a property.' }
  if (!name) return { error: 'Give the event a name.' }
  if (!EVENT_TYPES.includes(eventType)) return { error: 'Pick an event type.' }
  if (!(await ensurePropertyInOrg(session.organization.id, propertyId))) {
    return { error: 'Property not found.' }
  }

  const startsAt = trimOrNull(formData.get('starts_at'))
  const endsAt = trimOrNull(formData.get('ends_at'))
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    return { error: 'End time must be after start time.' }
  }

  const reference = await nextReference(session.organization.id)
  const admin = createAdminClient()
  const { data: created, error } = await admin
    .from('events')
    .insert({
      org_id: session.organization.id,
      property_id: propertyId,
      reference,
      name,
      event_type: eventType,
      status: 'inquiry',
      starts_at: startsAt,
      ends_at: endsAt,
      guests_expected: intOrNull(formData.get('guests_expected')),
      contact_name: trimOrNull(formData.get('contact_name')),
      contact_email: trimOrNull(formData.get('contact_email')),
      contact_phone: trimOrNull(formData.get('contact_phone')),
      contact_company: trimOrNull(formData.get('contact_company')),
      source: trimOrNull(formData.get('source')),
      internal_notes: trimOrNull(formData.get('internal_notes')),
      owner_id: session.userId,
    })
    .select('id')
    .single()
  if (error || !created) return { error: error?.message ?? 'Could not create event.' }

  await logActivity(
    created.id,
    session.organization.id,
    'created',
    `Event created (${reference}).`,
    { id: session.userId, label: session.email },
  )

  revalidatePath('/events')
  redirect(`/events/${created.id}`)
}

export async function updateEventDetailsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  if (!id) return { error: 'Missing event.' }
  const existing = await loadEventForOrg(session.organization.id, id)
  if (!existing) return { error: 'Event not found.' }

  const name = trim(formData.get('name'))
  const eventType = trim(formData.get('event_type')) as EventType
  if (!name) return { error: 'Give the event a name.' }
  if (!EVENT_TYPES.includes(eventType)) return { error: 'Pick an event type.' }

  const startsAt = trimOrNull(formData.get('starts_at'))
  const endsAt = trimOrNull(formData.get('ends_at'))
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    return { error: 'End time must be after start time.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('events')
    .update({
      name,
      event_type: eventType,
      starts_at: startsAt,
      ends_at: endsAt,
      guests_expected: intOrNull(formData.get('guests_expected')),
      guests_guaranteed: intOrNull(formData.get('guests_guaranteed')),
      guests_actual: intOrNull(formData.get('guests_actual')),
      contact_name: trimOrNull(formData.get('contact_name')),
      contact_email: trimOrNull(formData.get('contact_email')),
      contact_phone: trimOrNull(formData.get('contact_phone')),
      contact_company: trimOrNull(formData.get('contact_company')),
      source: trimOrNull(formData.get('source')),
      internal_notes: trimOrNull(formData.get('internal_notes')),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', session.organization.id)
  if (error) return { error: error.message }

  revalidateEvent(id)
  return { success: 'Saved.' }
}

export async function changeStatusAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  const next = trim(formData.get('status')) as EventStatus
  if (!id || !EVENT_STATUSES.includes(next)) return
  const existing = await loadEventForOrg(session.organization.id, id)
  if (!existing) return
  if (existing.status === next) return

  const admin = createAdminClient()
  await admin
    .from('events')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', session.organization.id)
  await logActivity(
    id,
    session.organization.id,
    'status_changed',
    `Status changed from ${existing.status} to ${next}.`,
    { id: session.userId, label: session.email },
  )
  revalidateEvent(id)
}

export async function deleteEventAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  if (!id) return
  const admin = createAdminClient()
  await admin
    .from('events')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)
  revalidatePath('/events')
  redirect('/events')
}

// ----------------------------------------------------------------------------
// Pricing rates
// ----------------------------------------------------------------------------
export async function updateRatesAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  if (!id) return { error: 'Missing event.' }
  const existing = await loadEventForOrg(session.organization.id, id)
  if (!existing) return { error: 'Event not found.' }

  const service_charge_pct = pctOrZero(formData.get('service_charge_pct'))
  const tax_pct = pctOrZero(formData.get('tax_pct'))
  if (service_charge_pct > 100 || tax_pct > 100) {
    return { error: 'Percentages must be between 0 and 100.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('events')
    .update({
      service_charge_pct,
      tax_pct,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', session.organization.id)
  if (error) return { error: error.message }

  await recomputeTotals(id, session.organization.id)
  revalidateEvent(id)
  return { success: 'Rates updated.' }
}

// ----------------------------------------------------------------------------
// Line items
// ----------------------------------------------------------------------------
export async function addLineItemAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  const eventId = trim(formData.get('event_id'))
  if (!eventId) return { error: 'Missing event.' }
  const existing = await loadEventForOrg(session.organization.id, eventId)
  if (!existing) return { error: 'Event not found.' }

  const description = trim(formData.get('description'))
  const section = trim(formData.get('section')) as EventLineSection
  if (!description) return { error: 'Description is required.' }
  if (!LINE_SECTIONS.includes(section)) return { error: 'Pick a section.' }

  const quantityRaw = trim(formData.get('quantity'))
  const quantity = quantityRaw === '' ? 1 : Number.parseFloat(quantityRaw)
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { error: 'Quantity must be 0 or higher.' }
  }
  const unit_price_cents = dollarsToCents(formData.get('unit_price'))

  const admin = createAdminClient()
  const { error } = await admin.from('event_line_items').insert({
    event_id: eventId,
    org_id: session.organization.id,
    section,
    description,
    quantity,
    unit_price_cents,
    taxable: formData.get('taxable') !== 'off',
    service_chargeable: formData.get('service_chargeable') !== 'off',
    sort_order: 0,
  })
  if (error) return { error: error.message }

  await recomputeTotals(eventId, session.organization.id)
  revalidateEvent(eventId)
  return { success: 'Line added.' }
}

export async function deleteLineItemAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  const eventId = trim(formData.get('event_id'))
  if (!id || !eventId) return
  const admin = createAdminClient()
  await admin
    .from('event_line_items')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)
  await recomputeTotals(eventId, session.organization.id)
  revalidateEvent(eventId)
}

// ----------------------------------------------------------------------------
// Schedule blocks
// ----------------------------------------------------------------------------
export async function addScheduleBlockAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  const eventId = trim(formData.get('event_id'))
  if (!eventId) return { error: 'Missing event.' }
  const existing = await loadEventForOrg(session.organization.id, eventId)
  if (!existing) return { error: 'Event not found.' }

  const label = trim(formData.get('label'))
  const startsAt = trim(formData.get('starts_at'))
  const endsAt = trim(formData.get('ends_at'))
  const spaceId = trimOrNull(formData.get('space_id'))

  if (!label) return { error: 'Label is required (e.g. "Ceremony").' }
  if (!startsAt || !endsAt) return { error: 'Start and end times are required.' }
  if (new Date(endsAt) <= new Date(startsAt)) {
    return { error: 'End must be after start.' }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('event_schedule_blocks').insert({
    event_id: eventId,
    org_id: session.organization.id,
    space_id: spaceId,
    label,
    starts_at: startsAt,
    ends_at: endsAt,
    setup_style: trimOrNull(formData.get('setup_style')),
    notes: trimOrNull(formData.get('notes')),
  })
  if (error) return { error: error.message }

  revalidateEvent(eventId)
  return { success: 'Block added.' }
}

export async function deleteScheduleBlockAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  const eventId = trim(formData.get('event_id'))
  if (!id || !eventId) return
  const admin = createAdminClient()
  await admin
    .from('event_schedule_blocks')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)
  revalidateEvent(eventId)
}

// ----------------------------------------------------------------------------
// Payments (offline)
// ----------------------------------------------------------------------------
export async function addPaymentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser({ write: true })
  const eventId = trim(formData.get('event_id'))
  if (!eventId) return { error: 'Missing event.' }
  const existing = await loadEventForOrg(session.organization.id, eventId)
  if (!existing) return { error: 'Event not found.' }

  const amount_cents = dollarsToCents(formData.get('amount'))
  if (amount_cents <= 0) return { error: 'Amount must be greater than zero.' }
  const method = trim(formData.get('method')) as EventPaymentMethod
  if (!PAYMENT_METHODS.includes(method)) return { error: 'Pick a payment method.' }
  const received_at = trim(formData.get('received_at')) || new Date().toISOString().slice(0, 10)

  const admin = createAdminClient()
  const { error } = await admin.from('event_payments').insert({
    event_id: eventId,
    org_id: session.organization.id,
    amount_cents,
    method,
    received_at,
    reference: trimOrNull(formData.get('reference')),
    notes: trimOrNull(formData.get('notes')),
    recorded_by: session.userId,
  })
  if (error) return { error: error.message }

  await logActivity(
    eventId,
    session.organization.id,
    'payment_recorded',
    `Recorded ${method} payment of $${(amount_cents / 100).toFixed(2)}.`,
    { id: session.userId, label: session.email },
  )
  revalidateEvent(eventId)
  return { success: 'Payment recorded.' }
}

export async function deletePaymentAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  const eventId = trim(formData.get('event_id'))
  if (!id || !eventId) return
  const admin = createAdminClient()
  await admin
    .from('event_payments')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)
  revalidateEvent(eventId)
}

// ----------------------------------------------------------------------------
// Proposal: generate / regenerate the public link, then mark "sent" so the
// status moves forward and the activity log records it. We don't actually
// email — the user copies the link from the UI in v1.
// ----------------------------------------------------------------------------
export async function generateProposalLinkAction(formData: FormData) {
  const session = await requireOrgUser({ write: true })
  const id = trim(formData.get('id'))
  if (!id) return
  const existing = await loadEventForOrg(session.organization.id, id)
  if (!existing) return

  const token = existing.proposal_token ?? randomToken()
  const wasNew = !existing.proposal_token

  const admin = createAdminClient()
  await admin
    .from('events')
    .update({
      proposal_token: token,
      proposal_sent_at: new Date().toISOString(),
      status: existing.status === 'inquiry' || existing.status === 'tentative'
        ? 'proposal_sent'
        : existing.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', session.organization.id)

  await logActivity(
    id,
    session.organization.id,
    'proposal_sent',
    wasNew ? 'Proposal link generated.' : 'Proposal re-sent.',
    { id: session.userId, label: session.email },
  )
  revalidateEvent(id)
}

// Public action: the client clicks accept or decline on the proposal page.
// We don't require auth — the unguessable token IS the auth.
export async function respondToProposalAction(formData: FormData) {
  const token = trim(formData.get('token'))
  const response = trim(formData.get('response'))
  if (!token) return
  if (response !== 'accepted' && response !== 'declined') return

  const admin = createAdminClient()
  const { data: ev } = await admin
    .from('events')
    .select('id, org_id, status, proposal_response, contact_name')
    .eq('proposal_token', token)
    .maybeSingle()
  if (!ev) return
  // Don't let a client flip a definite/cancelled deal back via the proposal link.
  if (
    ev.status === 'definite' ||
    ev.status === 'completed' ||
    ev.status === 'cancelled' ||
    ev.status === 'lost'
  ) {
    redirect(`/proposal/${token}?responded=1`)
  }

  const nextStatus: EventStatus = response === 'accepted' ? 'definite' : 'lost'
  await admin
    .from('events')
    .update({
      proposal_response: response,
      proposal_responded_at: new Date().toISOString(),
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ev.id)

  await logActivity(
    ev.id,
    ev.org_id,
    response === 'accepted' ? 'proposal_accepted' : 'proposal_declined',
    response === 'accepted'
      ? `Client accepted the proposal${ev.contact_name ? ` (${ev.contact_name})` : ''}.`
      : `Client declined the proposal${ev.contact_name ? ` (${ev.contact_name})` : ''}.`,
    { id: null, label: ev.contact_name ?? 'Client' },
  )
  revalidatePath(`/events/${ev.id}`)
  redirect(`/proposal/${token}?responded=1`)
}

// Best-effort "client viewed" pixel-style logger. Called from the public
// proposal page on first render. Idempotent-ish: only logs once per session
// by checking proposal_viewed_at — we still update the timestamp on every
// view so reps see "last viewed" recency, but we only write an activity row
// on the first view.
export async function recordProposalViewAction(token: string) {
  if (!token) return
  const admin = createAdminClient()
  const { data: ev } = await admin
    .from('events')
    .select('id, org_id, proposal_viewed_at, contact_name')
    .eq('proposal_token', token)
    .maybeSingle()
  if (!ev) return

  const wasFirst = !ev.proposal_viewed_at
  await admin
    .from('events')
    .update({ proposal_viewed_at: new Date().toISOString() })
    .eq('id', ev.id)

  if (wasFirst) {
    await logActivity(
      ev.id,
      ev.org_id,
      'proposal_viewed',
      `Client opened the proposal${ev.contact_name ? ` (${ev.contact_name})` : ''}.`,
      { id: null, label: ev.contact_name ?? 'Client' },
    )
    revalidatePath(`/events/${ev.id}`)
  }
}
