'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  denyIfRestricted,
  requireOrgOwner,
  requirePlatformAdmin,
  requireUser,
} from '@/lib/auth/session'
import {
  generatePassword,
  validatePassword,
} from '@/lib/auth/password'
import { BRAND } from '@/lib/brand'
import { getGateForProperty } from '@/lib/billing/gate'
import {
  executeTenantBillingReset,
  previewTenantBillingReset,
  type ResetPreview,
  type ResetSummary,
} from '@/lib/billing/reset-tenant'
import { isEmailConfigured } from '@/lib/email/client'
import { sendWelcomeEmail } from '@/lib/email/send'
import { r2DeleteObject, r2PutObject } from '@/lib/r2/upload'
import {
  startSubscriptionForProperty,
  startSubscriptionsForOrg,
  type StartSubscriptionForOrgResult,
} from '@/lib/stripe/start-subscription'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AppRole, Property } from '@/lib/supabase/types'
import { slugify, uniqueSlug } from '@/lib/utils/slugify'

function roleLabel(role: AppRole): string {
  if (role === 'org_owner') return 'an owner'
  if (role === 'org_staff') return 'staff'
  return 'a platform admin'
}

/**
 * Generate a one-time setup link the recipient can click to set their own
 * password. The link goes to /auth/callback?code=... which exchanges the code
 * for a session and forwards them to /set-password. Default expiry is ~1h.
 */
async function generateSetupLink(email: string): Promise<string | null> {
  const admin = createAdminClient()
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '')
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${siteUrl}/auth/callback` },
  })
  if (error || !data.properties?.action_link) {
    console.error('[email] could not generate setup link', error)
    return null
  }
  return data.properties.action_link
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export type ActionResult = { error?: string; success?: string }

/**
 * Platform-admin action: create a new tenant (org + properties + initial owner).
 * The initial owner gets a username/password; they sign in directly at /login.
 */
export async function createTenantAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const inviter = await requirePlatformAdmin()

  const orgSlug = (formData.get('org_slug') as string)?.trim().toLowerCase()
  const orgName = (formData.get('org_name') as string)?.trim()
  const ownerEmail = (formData.get('owner_email') as string)?.trim().toLowerCase()
  const ownerPassword = formData.get('owner_password') as string
  const passwordMode = (formData.get('password_mode') as string) || 'self'
  const sendWelcome = passwordMode === 'self' || formData.get('send_welcome') === 'on'

  // Properties come as repeated property_slug[] / property_name[] fields.
  const propertySlugs = formData.getAll('property_slug').map((v) => String(v).trim().toLowerCase())
  const propertyNames = formData.getAll('property_name').map((v) => String(v).trim())

  if (!orgSlug || !orgName || !ownerEmail) {
    return { error: 'Org name, slug, and owner email are required.' }
  }
  if (!SLUG_RE.test(orgSlug)) {
    return { error: 'Org slug must be kebab-case (a-z, 0-9, hyphens).' }
  }
  if (passwordMode === 'admin') {
    if (!ownerPassword) {
      return { error: 'Set a temporary password or switch to self-set mode.' }
    }
    const pwCheck = validatePassword(ownerPassword)
    if (!pwCheck.ok) return { error: `Owner ${pwCheck.error.toLowerCase()}` }
  } else if (!isEmailConfigured()) {
    return {
      error:
        'Email is not configured, so the setup link can\'t be delivered. ' +
        'Choose "I\'ll set a temporary password" instead.',
    }
  }
  const properties = propertySlugs
    .map((slug, i) => ({ slug, name: propertyNames[i]?.trim() ?? '' }))
    .filter((p) => p.slug || p.name)
  if (properties.length === 0) {
    return { error: 'Add at least one property.' }
  }
  for (const p of properties) {
    if (!p.slug || !p.name) {
      return { error: 'Each property needs both a slug and a name.' }
    }
    if (!SLUG_RE.test(p.slug)) {
      return { error: `Property slug "${p.slug}" must be kebab-case.` }
    }
  }

  const admin = createAdminClient()

  // 1. Create the org. Slug uniqueness is DB-enforced.
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({ slug: orgSlug, name: orgName })
    .select('id')
    .single()
  if (orgErr) {
    if (orgErr.code === '23505') {
      return { error: `Org slug "${orgSlug}" already exists.` }
    }
    return { error: orgErr.message }
  }
  const orgId = org.id

  // 2. Properties.
  const propertyRows = properties.map((p) => ({
    org_id: orgId,
    slug: p.slug,
    name: p.name,
    r2_prefix: `${orgSlug}/${p.slug}/`,
  }))
  const { error: propErr } = await admin.from('properties').insert(propertyRows)
  if (propErr) return { error: propErr.message }

  // 3. Owner — auth user with confirmed email. Password is either set now
  //    (admin mode) or left as a random placeholder (self-set mode; the
  //    recovery link the email contains is what they actually use).
  const existingUserId = await findUserId(ownerEmail)
  const effectivePassword =
    passwordMode === 'admin' ? ownerPassword : generatePassword()
  let ownerId: string
  if (existingUserId) {
    const { error } = await admin.auth.admin.updateUserById(existingUserId, {
      password: effectivePassword,
      email_confirm: true,
    })
    if (error) return { error: error.message }
    ownerId = existingUserId
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password: effectivePassword,
      email_confirm: true,
    })
    if (error) return { error: error.message }
    ownerId = data.user!.id
  }

  // 4. Profile link.
  const { error: profileErr } = await admin
    .from('profiles')
    .upsert({ id: ownerId, org_id: orgId, role: 'org_owner' })
  if (profileErr) return { error: profileErr.message }

  // 5. Welcome email (mandatory in self-set mode; optional in admin-set).
  //    Best-effort: failure doesn't roll back the tenant.
  if (sendWelcome) {
    const setupLink =
      passwordMode === 'self'
        ? (await generateSetupLink(ownerEmail)) ?? undefined
        : undefined
    await sendWelcomeEmail({
      to: ownerEmail,
      recipientName: null,
      orgName,
      roleLabel: roleLabel('org_owner'),
      inviterName: inviter.email,
      setupLink,
    })
  }

  // Note: we deliberately do NOT auto-start the Stripe subscription
  // here. Pricing is per-property, so the trigger to start billing
  // belongs to the owner's first paid action (adding a property /
  // hitting /billing → "Start subscription"). The gate restricts
  // writes until the sub is active, so the owner can sign in and
  // explore but can't accumulate billable activity for free.

  revalidatePath('/admin')
  redirect('/admin')
}

/**
 * Org-owner action: add a team member to the caller's org.
 */
export async function createTeamMemberAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgOwner()

  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const password = formData.get('password') as string
  const fullName = (formData.get('full_name') as string)?.trim() || null
  const passwordMode = (formData.get('password_mode') as string) || 'self'
  const sendWelcome = passwordMode === 'self' || formData.get('send_welcome') === 'on'

  if (!email) return { error: 'Email is required.' }
  if (passwordMode === 'admin') {
    if (!password) return { error: 'Set a temporary password or switch to self-set mode.' }
    const pwCheck = validatePassword(password)
    if (!pwCheck.ok) return { error: pwCheck.error }
  } else if (!isEmailConfigured()) {
    return {
      error:
        'Email is not configured, so the setup link can\'t be delivered. ' +
        'Choose "I\'ll set a temporary password" instead.',
    }
  }

  const admin = createAdminClient()

  const existingId = await findUserId(email)
  if (existingId) {
    // Don't silently steal a user from another org. Surface it.
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('org_id')
      .eq('id', existingId)
      .maybeSingle()
    if (existingProfile?.org_id && existingProfile.org_id !== session.organization.id) {
      return { error: `${email} already belongs to another organization.` }
    }
  }

  const effectivePassword =
    passwordMode === 'admin' ? password : generatePassword()
  let userId: string
  if (existingId) {
    const { error } = await admin.auth.admin.updateUserById(existingId, {
      password: effectivePassword,
      email_confirm: true,
    })
    if (error) return { error: error.message }
    userId = existingId
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: effectivePassword,
      email_confirm: true,
    })
    if (error) return { error: error.message }
    userId = data.user!.id
  }

  const { error: profileErr } = await admin.from('profiles').upsert({
    id: userId,
    org_id: session.organization.id,
    role: 'org_staff',
    full_name: fullName,
  })
  if (profileErr) return { error: profileErr.message }

  let emailSent = false
  if (sendWelcome) {
    const setupLink =
      passwordMode === 'self'
        ? (await generateSetupLink(email)) ?? undefined
        : undefined
    emailSent = await sendWelcomeEmail({
      to: email,
      recipientName: fullName,
      orgName: session.organization.name,
      roleLabel: roleLabel('org_staff'),
      inviterName: session.email,
      setupLink,
    })
  }

  revalidatePath('/team')
  const suffix = sendWelcome
    ? emailSent
      ? ' Welcome email sent.'
      : ' (Welcome email not sent — email not configured.)'
    : ''
  return {
    success: `${email} added to ${session.organization.name}.${suffix}`,
  }
}

async function findUserId(email: string): Promise<string | null> {
  const admin = createAdminClient()
  let page = 1
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) throw error
    const match = data.users.find((u) => u.email === email)
    if (match) return match.id
    if (data.users.length < 200) return null
    page += 1
  }
}

// ----------------------------------------------------------------------------
// Tenant management actions (platform admin only)
// ----------------------------------------------------------------------------

export async function updateOrgNameAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requirePlatformAdmin()
  const orgId = String(formData.get('org_id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!orgId || !name) return { error: 'Name is required.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('organizations')
    .update({ name })
    .eq('id', orgId)
  if (error) return { error: error.message }

  revalidatePath(`/admin/tenants/${orgId}`)
  revalidatePath('/admin')
  return { success: 'Saved.' }
}

export async function addPropertyAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requirePlatformAdmin()
  const orgId = String(formData.get('org_id') ?? '')
  const orgSlug = String(formData.get('org_slug') ?? '')
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase()
  const name = String(formData.get('name') ?? '').trim()

  if (!orgId || !orgSlug) return { error: 'Missing org.' }
  if (!slug || !name) return { error: 'Slug and name are required.' }
  if (!SLUG_RE.test(slug)) {
    return { error: 'Slug must be kebab-case (a-z, 0-9, hyphens).' }
  }

  const admin = createAdminClient()
  const { data: inserted, error } = await admin
    .from('properties')
    .insert({
      org_id: orgId,
      slug,
      name,
      r2_prefix: `${orgSlug}/${slug}/`,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') {
      return { error: `Property slug "${slug}" already exists in this org.` }
    }
    return { error: error.message }
  }

  // Start the property's subscription on Stripe (best-effort — the property
  // is created even if Stripe is unreachable; admin can retry from the
  // Billing page). Setup fee is suppressed because the org has at least
  // one prior subscription if it had any properties before this one — and
  // startSubscriptionForProperty's own check confirms that.
  if (inserted?.id) {
    try {
      await startSubscriptionForProperty(inserted.id)
    } catch (err) {
      console.warn(
        '[admin] addPropertyAction: subscription start failed',
        err instanceof Error ? err.message : err,
      )
    }
  }

  revalidatePath(`/admin/tenants/${orgId}`)
  revalidatePath('/admin')
  return { success: `Added ${name}.` }
}

export async function removePropertyAction(formData: FormData) {
  await requirePlatformAdmin()
  const orgId = String(formData.get('org_id') ?? '')
  const propertyId = String(formData.get('property_id') ?? '')
  if (!orgId || !propertyId) return

  await cancelPropertySubscriptionBestEffort(propertyId)

  const admin = createAdminClient()
  await admin.from('properties').delete().eq('id', propertyId)
  // The billing_subscriptions row cascades on property delete.

  revalidatePath(`/admin/tenants/${orgId}`)
  revalidatePath('/admin')
}

/**
 * Cancel the Stripe subscription associated with a property before the
 * property row (and therefore its billing_subscriptions row) is deleted.
 *
 * Immediate cancel (not cancel_at_period_end) because the property is
 * about to be deleted: keeping the subscription billable through the end
 * of the period would have Stripe fire customer.subscription.updated /
 * .deleted events whose webhook handler can't find the property row
 * anymore (FK violation on upsert → webhook 500 → Stripe retry loop).
 * `prorate: false` means no refund for the unused portion of the
 * current period — the customer paid for it, the service ends now.
 *
 * Failures are swallowed so the property delete isn't blocked by a
 * Stripe outage; the resulting orphan subscription can be cleaned up
 * from the Stripe dashboard.
 */
async function cancelPropertySubscriptionBestEffort(
  propertyId: string,
): Promise<void> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('billing_subscriptions')
    .select('stripe_subscription_id, status')
    .eq('property_id', propertyId)
    .maybeSingle()
  const subId = data?.stripe_subscription_id
  if (!subId) return
  if (data?.status === 'canceled' || data?.status === 'incomplete_expired') {
    return
  }
  try {
    await stripe().subscriptions.cancel(subId, {
      invoice_now: false,
      prorate: false,
    })
  } catch (err) {
    console.warn(
      '[admin] cancelPropertySubscription: stripe cancel failed',
      err instanceof Error ? err.message : err,
    )
  }
}

export async function addOrgMemberAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const inviter = await requirePlatformAdmin()
  const orgId = String(formData.get('org_id') ?? '')
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const role = String(formData.get('role') ?? 'org_staff') as AppRole
  const fullName = (String(formData.get('full_name') ?? '').trim() || null) as
    | string
    | null
  const passwordMode = (formData.get('password_mode') as string) || 'self'
  const sendWelcome = passwordMode === 'self' || formData.get('send_welcome') === 'on'

  if (!orgId) return { error: 'Missing org.' }
  if (!email) return { error: 'Email is required.' }
  if (passwordMode === 'admin') {
    if (!password) return { error: 'Set a temporary password or switch to self-set mode.' }
    const pwCheck = validatePassword(password)
    if (!pwCheck.ok) return { error: pwCheck.error }
  } else if (!isEmailConfigured()) {
    return {
      error:
        'Email is not configured, so the setup link can\'t be delivered. ' +
        'Choose "I\'ll set a temporary password" instead.',
    }
  }
  if (role !== 'org_owner' && role !== 'org_staff') {
    return { error: 'Invalid role.' }
  }

  const admin = createAdminClient()

  const existingId = await findUserId(email)
  if (existingId) {
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('org_id')
      .eq('id', existingId)
      .maybeSingle()
    if (existingProfile?.org_id && existingProfile.org_id !== orgId) {
      return { error: `${email} already belongs to another organization.` }
    }
  }

  const effectivePassword =
    passwordMode === 'admin' ? password : generatePassword()
  let userId: string
  if (existingId) {
    const { error } = await admin.auth.admin.updateUserById(existingId, {
      password: effectivePassword,
      email_confirm: true,
    })
    if (error) return { error: error.message }
    userId = existingId
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: effectivePassword,
      email_confirm: true,
    })
    if (error) return { error: error.message }
    userId = data.user!.id
  }

  const { error: profileErr } = await admin.from('profiles').upsert({
    id: userId,
    org_id: orgId,
    role,
    full_name: fullName,
  })
  if (profileErr) return { error: profileErr.message }

  let emailSent = false
  if (sendWelcome) {
    const { data: org } = await admin
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .maybeSingle()
    const setupLink =
      passwordMode === 'self'
        ? (await generateSetupLink(email)) ?? undefined
        : undefined
    emailSent = await sendWelcomeEmail({
      to: email,
      recipientName: fullName,
      orgName: org?.name ?? 'your organization',
      roleLabel: roleLabel(role),
      inviterName: inviter.email,
      setupLink,
    })
  }

  revalidatePath(`/admin/tenants/${orgId}`)
  revalidatePath('/admin')
  const suffix = sendWelcome
    ? emailSent
      ? ' Welcome email sent.'
      : ' (Welcome email not sent — email not configured.)'
    : ''
  return { success: `${email} added as ${role.replace('_', ' ')}.${suffix}` }
}

export async function removeOrgMemberAction(formData: FormData) {
  await requirePlatformAdmin()
  const orgId = String(formData.get('org_id') ?? '')
  const userId = String(formData.get('user_id') ?? '')
  if (!orgId || !userId) return

  const admin = createAdminClient()
  // Detach the profile from the org. The auth.users record stays — they could
  // be re-added to another tenant later.
  await admin
    .from('profiles')
    .update({ org_id: null, role: 'org_staff' })
    .eq('id', userId)

  revalidatePath(`/admin/tenants/${orgId}`)
}

// ----------------------------------------------------------------------------
// Tenant-side property management (org_owner manages their OWN org's properties)
// ----------------------------------------------------------------------------

export async function ownerAddPropertyAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgOwner()
  const blocked = denyIfRestricted(session)
  if (blocked) return blocked

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Name is required.' }

  const base = slugify(name)
  if (!base) return { error: 'Name must include letters or numbers.' }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('properties')
    .select('slug')
    .eq('org_id', session.organization.id)
  const taken = new Set((existing ?? []).map((p) => p.slug))
  const slug = uniqueSlug(base, (s) => taken.has(s))

  const { data: inserted, error } = await admin
    .from('properties')
    .insert({
      org_id: session.organization.id,
      slug,
      name,
      r2_prefix: `${session.organization.slug}/${slug}/`,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  // Create the per-property Stripe subscription so this property starts
  // billing on its own card. Best-effort — owner can also kick this off
  // from /billing if Stripe is unreachable.
  if (inserted?.id) {
    try {
      await startSubscriptionForProperty(inserted.id)
    } catch (err) {
      console.warn(
        '[owner] addProperty: subscription start failed',
        err instanceof Error ? err.message : err,
      )
    }
  }

  revalidatePath('/properties')
  revalidatePath('/dashboard')
  return { success: `Added ${name}.` }
}

export async function ownerRemovePropertyAction(formData: FormData) {
  const session = await requireOrgOwner()
  if (session.gate.restrictWrites) return

  const propertyId = String(formData.get('property_id') ?? '')
  if (!propertyId) return

  await cancelPropertySubscriptionBestEffort(propertyId)

  const admin = createAdminClient()
  // Scope the delete to the caller's org so nobody can pass an arbitrary id.
  await admin
    .from('properties')
    .delete()
    .eq('id', propertyId)
    .eq('org_id', session.organization.id)

  revalidatePath('/properties')
  revalidatePath('/dashboard')
}

/**
 * Authorize the caller to modify this property: platform admins always pass;
 * org owners pass only for their own org's properties. Returns the property
 * row or throws / redirects.
 */
async function authorizePropertyAccess(
  propertyId: string,
): Promise<Property> {
  const user = await requireUser()
  const admin = createAdminClient()
  const { data: property, error } = await admin
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .maybeSingle()
  if (error) throw error
  if (!property) throw new Error('Property not found')

  const isPlatformAdmin = user.profile.role === 'platform_admin'
  const isOrgOwner =
    user.profile.role === 'org_owner' &&
    user.profile.org_id === property.org_id
  if (!isPlatformAdmin && !isOrgOwner) {
    throw new Error('Not authorized')
  }
  return property as Property
}

const TEXT_FIELDS = [
  'name',
  'description',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal_code',
  'country',
  'phone',
  'email',
  'website',
] as const

export async function updatePropertyAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = String(formData.get('property_id') ?? '')
  if (!propertyId) return { error: 'Missing property.' }
  const property = await authorizePropertyAccess(propertyId)
  const gate = await getGateForProperty(property.id)
  if (gate.restrictWrites) {
    return { error: gate.message ?? 'Editing is locked while billing is past due.' }
  }

  const update: Record<string, string | null> = {}
  for (const field of TEXT_FIELDS) {
    const raw = formData.get(field)
    if (raw === null) continue
    const value = String(raw).trim()
    update[field] = value === '' ? null : value
  }
  if (!update.name) return { error: 'Name is required.' }
  if (update.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(update.email)) {
    return { error: 'Email must be a valid address.' }
  }
  if (update.website) {
    try {
      new URL(update.website)
    } catch {
      return {
        error: 'Website must be a full URL (e.g. https://example.com).',
      }
    }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('properties')
    .update(update)
    .eq('id', propertyId)
  if (error) return { error: error.message }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath('/properties')
  revalidatePath('/dashboard')
  return { success: 'Saved.' }
}

const LOGO_MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const LOGO_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

export async function uploadPropertyLogoAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = String(formData.get('property_id') ?? '')
  if (!propertyId) return { error: 'Missing property.' }
  const property = await authorizePropertyAccess(propertyId)
  const gate = await getGateForProperty(property.id)
  if (gate.restrictWrites) {
    return { error: gate.message ?? 'Editing is locked while billing is past due.' }
  }

  const file = formData.get('logo')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a logo file to upload.' }
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { error: 'Logo must be under 5 MB.' }
  }
  const ext = LOGO_MIME_EXT[file.type]
  if (!ext) {
    return { error: 'Logo must be PNG, JPEG, WebP, or SVG.' }
  }

  const newKey = `${property.r2_prefix}_meta/logo.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  await r2PutObject(newKey, buffer, file.type)

  // If the previous logo had a different extension, delete the orphan so it
  // doesn't linger in R2 and confuse the cache.
  if (property.logo_key && property.logo_key !== newKey) {
    await r2DeleteObject(property.logo_key)
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('properties')
    .update({
      logo_key: newKey,
      logo_uploaded_at: new Date().toISOString(),
    })
    .eq('id', propertyId)
  if (error) return { error: error.message }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath('/properties')
  return { success: 'Logo updated.' }
}

export async function removePropertyLogoAction(formData: FormData) {
  const propertyId = String(formData.get('property_id') ?? '')
  if (!propertyId) return
  const property = await authorizePropertyAccess(propertyId)
  const gate = await getGateForProperty(property.id)
  if (gate.restrictWrites) return

  if (property.logo_key) {
    await r2DeleteObject(property.logo_key)
  }
  const admin = createAdminClient()
  await admin
    .from('properties')
    .update({ logo_key: null, logo_uploaded_at: null })
    .eq('id', propertyId)

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath('/properties')
}

/**
 * Platform-admin action: start one Stripe subscription per property for a
 * tenant. Idempotent — properties that already have a non-terminal sub are
 * skipped (returned as `existing`). Setup fee is added to the first
 * subscription only.
 */
export async function startSubscriptionAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requirePlatformAdmin()
  const orgId = String(formData.get('org_id') ?? '')
  if (!orgId) return { error: 'Missing org.' }

  let result: StartSubscriptionForOrgResult
  try {
    result = await startSubscriptionsForOrg(orgId)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }

  revalidatePath(`/admin/tenants/${orgId}`)
  revalidatePath('/admin')

  const created = result.results.filter((r) => r.kind === 'created').length
  const existing = result.results.filter((r) => r.kind === 'existing').length
  if (created === 0) {
    return {
      success: `No new subscriptions — all ${existing} properties were already subscribed.`,
    }
  }
  return {
    success:
      `Created ${created} subscription${created === 1 ? '' : 's'}` +
      (existing > 0 ? ` (${existing} already existed)` : '') +
      `. Each property has 14 days to attach a card.`,
  }
}

/**
 * Platform-admin action: dry-run a tenant billing reset. Returns counts of
 * what an actual reset would touch so the confirmation UI can show
 * "this will cancel 3 subscriptions and void 2 invoices" before the
 * destructive button is enabled. Read-only against both Stripe and the
 * DB — no writes.
 */
export async function previewResetTenantBillingAction(
  _prev: ActionResult & { preview?: ResetPreview },
  formData: FormData,
): Promise<ActionResult & { preview?: ResetPreview }> {
  await requirePlatformAdmin()
  const orgId = String(formData.get('org_id') ?? '')
  if (!orgId) return { error: 'Missing org.' }
  try {
    const preview = await previewTenantBillingReset(orgId)
    return { preview }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to load preview.',
    }
  }
}

/**
 * Platform-admin action: actually perform the reset. Requires the org
 * slug to be typed back as `confirmation` (same convention as
 * deleteTenantAction). `hard=on` in the form data additionally deletes
 * the Stripe Customer and clears organizations.stripe_customer_id.
 *
 * See lib/billing/reset-tenant.ts for full semantics.
 */
export async function resetTenantBillingAction(
  _prev: ActionResult & { summary?: ResetSummary },
  formData: FormData,
): Promise<ActionResult & { summary?: ResetSummary }> {
  await requirePlatformAdmin()
  const orgId = String(formData.get('org_id') ?? '')
  const confirmation = String(formData.get('confirmation') ?? '').trim()
  const expected = String(formData.get('expected_confirmation') ?? '').trim()
  const hard = formData.get('hard') === 'on'
  if (!orgId) return { error: 'Missing org.' }
  if (!confirmation || confirmation !== expected) {
    return { error: 'Confirmation does not match the org slug.' }
  }
  try {
    const summary = await executeTenantBillingReset(orgId, { hard })
    revalidatePath(`/admin/tenants/${orgId}`)
    revalidatePath('/admin')
    revalidatePath('/billing')
    return { summary, success: 'Billing reset complete.' }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Reset failed.',
    }
  }
}

export async function deleteTenantAction(formData: FormData) {
  await requirePlatformAdmin()
  const orgId = String(formData.get('org_id') ?? '')
  const confirmation = String(formData.get('confirmation') ?? '').trim()
  const expected = String(formData.get('expected_confirmation') ?? '').trim()
  if (!orgId || !confirmation || confirmation !== expected) return

  const admin = createAdminClient()

  // Cancel every Stripe subscription attached to this org before the
  // cascade-delete removes our billing_subscriptions rows. Best-effort —
  // a Stripe outage shouldn't block the tenant delete, but orphan subs
  // that survive will keep charging the customer until manually cleaned
  // up in the Stripe dashboard, so we want this to almost always succeed.
  const { data: subs } = await admin
    .from('billing_subscriptions')
    .select('stripe_subscription_id, status')
    .eq('org_id', orgId)
  for (const s of subs ?? []) {
    if (!s.stripe_subscription_id) continue
    if (s.status === 'canceled' || s.status === 'incomplete_expired') continue
    try {
      await stripe().subscriptions.cancel(s.stripe_subscription_id, {
        invoice_now: false,
        prorate: false,
      })
    } catch (err) {
      console.warn(
        '[admin] deleteTenantAction: stripe cancel failed',
        err instanceof Error ? err.message : err,
      )
    }
  }

  // properties + invoices cascade; profiles get org_id set null via FK.
  await admin.from('organizations').delete().eq('id', orgId)

  revalidatePath('/admin')
  redirect('/admin')
}

// ----------------------------------------------------------------------------
// Public-signup review (platform admin only)
// ----------------------------------------------------------------------------

/**
 * Approve a public signup request and provision the tenant in one click:
 * create the org (slug auto-generated from hotel name), one initial property
 * with the same name, the owner auth user, profile, and email them a setup
 * link. The signup row is marked approved + linked to the new org so the
 * audit trail survives.
 *
 * Account-takeover guard: refuses to approve if the signup email already
 * belongs to an existing auth user. The /signup form is publicly writable,
 * so without this check an attacker could submit a victim's email; the
 * approve flow would rewrite the victim's password and re-parent their
 * profile into the attacker's org. The admin must resolve the collision
 * manually (verify ownership of the email, then reject + create the tenant
 * via /admin → "New tenant" with a clean email).
 *
 * Idempotency: if `approved_org_id` is already set, returns success without
 * re-provisioning. If the signup was rejected, refuses.
 */
export async function approveSignupAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const inviter = await requirePlatformAdmin()
  const signupId = String(formData.get('signup_id') ?? '')
  if (!signupId) return { error: 'Missing signup id.' }

  const admin = createAdminClient()

  const { data: signup, error: signupErr } = await admin
    .from('tenant_signup_requests')
    .select('*')
    .eq('id', signupId)
    .maybeSingle()
  if (signupErr) return { error: signupErr.message }
  if (!signup) return { error: 'Signup not found.' }
  if (signup.status === 'approved') {
    revalidatePath('/admin')
    return { success: 'Already approved.' }
  }
  if (signup.status === 'rejected') {
    return { error: 'This request was already rejected.' }
  }

  // Account-takeover guard. The /signup form accepts any email; without
  // this we'd silently re-password an existing user and re-parent their
  // profile when the admin approves.
  const existingUserId = await findUserId(signup.email)
  if (existingUserId) {
    return {
      error:
        `${signup.email} already has an account on ${BRAND.name}. ` +
        `Reject this request and contact the prospect to verify ownership ` +
        `of the email — then onboard manually from "New tenant" if appropriate.`,
    }
  }

  // 1. Org with auto-slug.
  const { data: existingOrgs } = await admin
    .from('organizations')
    .select('slug')
  const taken = new Set((existingOrgs ?? []).map((o) => o.slug))
  const baseSlug = slugify(signup.hotel_name) || 'hotel'
  const orgSlug = uniqueSlug(baseSlug, (s) => taken.has(s))

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({ slug: orgSlug, name: signup.hotel_name })
    .select('id')
    .single()
  if (orgErr) return { error: orgErr.message }
  const orgId = org.id

  // 2. Owner auth user + profile. Email collision is impossible here —
  //    we returned above if findUserId(signup.email) was non-null.
  //
  //    We deliberately do NOT pre-create a property or auto-start the
  //    Stripe subscription. Pricing is per-property, so the owner
  //    triggers billing when they add their first property — see the
  //    self-serve flow on /billing → "Start subscription". The gate
  //    restricts writes until then, so the owner can sign in and
  //    explore the empty workspace but can't accumulate billable
  //    activity for free.
  const placeholderPassword = generatePassword()
  const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
    email: signup.email,
    password: placeholderPassword,
    email_confirm: true,
  })
  if (createErr) return { error: createErr.message }
  const ownerId = createdUser.user!.id

  await admin
    .from('profiles')
    .upsert({
      id: ownerId,
      org_id: orgId,
      role: 'org_owner',
      full_name: signup.full_name,
    })

  // 3. Welcome email with one-time setup link. Best-effort.
  if (isEmailConfigured()) {
    const setupLink = (await generateSetupLink(signup.email)) ?? undefined
    await sendWelcomeEmail({
      to: signup.email,
      recipientName: signup.full_name,
      orgName: signup.hotel_name,
      roleLabel: roleLabel('org_owner'),
      inviterName: inviter.email,
      setupLink,
    })
  } else {
    console.warn(
      '[signup] approved without sending welcome email — RESEND_API_KEY not set',
    )
  }

  // 4. Mark signup approved + link to the org.
  await admin
    .from('tenant_signup_requests')
    .update({
      status: 'approved',
      approved_org_id: orgId,
      approved_at: new Date().toISOString(),
      approved_by: inviter.userId,
    })
    .eq('id', signupId)

  revalidatePath('/admin')
  revalidatePath(`/admin/tenants/${orgId}`)
  return {
    success:
      `Approved — provisioned ${signup.hotel_name}. ` +
      `The owner will be billed when they add their first property.`,
  }
}

export async function rejectSignupAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const inviter = await requirePlatformAdmin()
  const signupId = String(formData.get('signup_id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim() || null
  if (!signupId) return { error: 'Missing signup id.' }

  const admin = createAdminClient()
  await admin
    .from('tenant_signup_requests')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      rejected_at: new Date().toISOString(),
      rejected_by: inviter.userId,
    })
    .eq('id', signupId)
    .eq('status', 'pending')

  revalidatePath('/admin')
  return { success: 'Rejected.' }
}
