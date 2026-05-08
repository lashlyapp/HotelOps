'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireOrgOwner, requirePlatformAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MIN_PASSWORD_LENGTH = 8

export type ActionResult = { error?: string; success?: string }

/**
 * Platform-admin action: create a new tenant (org + properties + initial owner).
 * The initial owner gets a username/password; they sign in directly at /login.
 */
export async function createTenantAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requirePlatformAdmin()

  const orgSlug = (formData.get('org_slug') as string)?.trim().toLowerCase()
  const orgName = (formData.get('org_name') as string)?.trim()
  const ownerEmail = (formData.get('owner_email') as string)?.trim().toLowerCase()
  const ownerPassword = formData.get('owner_password') as string

  // Properties come as repeated property_slug[] / property_name[] fields.
  const propertySlugs = formData.getAll('property_slug').map((v) => String(v).trim().toLowerCase())
  const propertyNames = formData.getAll('property_name').map((v) => String(v).trim())

  if (!orgSlug || !orgName || !ownerEmail || !ownerPassword) {
    return { error: 'All fields are required.' }
  }
  if (!SLUG_RE.test(orgSlug)) {
    return { error: 'Org slug must be kebab-case (a-z, 0-9, hyphens).' }
  }
  if (ownerPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Owner password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
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

  // 3. Owner — auth user with confirmed email + password.
  const existingUserId = await findUserId(ownerEmail)
  let ownerId: string
  if (existingUserId) {
    const { error } = await admin.auth.admin.updateUserById(existingUserId, {
      password: ownerPassword,
      email_confirm: true,
    })
    if (error) return { error: error.message }
    ownerId = existingUserId
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
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

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
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

  let userId: string
  if (existingId) {
    const { error } = await admin.auth.admin.updateUserById(existingId, {
      password,
      email_confirm: true,
    })
    if (error) return { error: error.message }
    userId = existingId
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
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

  revalidatePath('/team')
  return { success: `${email} added to ${session.organization.name}.` }
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
