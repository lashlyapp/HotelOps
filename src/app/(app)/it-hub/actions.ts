'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ItCredentialCategory,
  ItEquipmentCategory,
  ItEquipmentStatus,
  ItNetworkType,
  ItVendorType,
} from '@/lib/supabase/types'

export type ActionResult = { error?: string; success?: string }

const NETWORK_TYPES: ItNetworkType[] = [
  'guest',
  'staff',
  'boh',
  'event',
  'iot',
  'other',
]
const CREDENTIAL_CATEGORIES: ItCredentialCategory[] = [
  'pms',
  'booking',
  'channel',
  'social',
  'accounting',
  'utility',
  'email',
  'marketing',
  'security',
  'other',
]
const EQUIPMENT_CATEGORIES: ItEquipmentCategory[] = [
  'router',
  'switch',
  'access_point',
  'tv',
  'printer',
  'phone',
  'pos',
  'camera',
  'smart_lock',
  'computer',
  'tablet',
  'speaker',
  'other',
]
const EQUIPMENT_STATUSES: ItEquipmentStatus[] = [
  'active',
  'spare',
  'retired',
  'broken',
]
const VENDOR_TYPES: ItVendorType[] = [
  'isp',
  'it_support',
  'software',
  'phone',
  'tv_cable',
  'security',
  'other',
]

function trim(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function trimOrNull(value: FormDataEntryValue | null): string | null {
  const v = trim(value)
  return v === '' ? null : v
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

function revalidateAll() {
  revalidatePath('/it-hub')
  revalidatePath('/it-hub/wifi')
  revalidatePath('/it-hub/logins')
  revalidatePath('/it-hub/equipment')
  revalidatePath('/it-hub/vendors')
}

// ----------------------------------------------------------------------------
// Wi-Fi networks
// ----------------------------------------------------------------------------
export async function saveNetworkAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser()
  const id = trim(formData.get('id'))
  const propertyId = trim(formData.get('property_id'))
  const label = trim(formData.get('label'))
  const networkType = trim(formData.get('network_type')) as ItNetworkType

  if (!propertyId) return { error: 'Choose a property.' }
  if (!label) return { error: 'Give the network a name (e.g. "Guest Wi-Fi").' }
  if (!NETWORK_TYPES.includes(networkType)) {
    return { error: 'Pick a network type.' }
  }
  if (!(await ensurePropertyInOrg(session.organization.id, propertyId))) {
    return { error: 'Property not found.' }
  }

  const row = {
    org_id: session.organization.id,
    property_id: propertyId,
    label,
    network_type: networkType,
    ssid: trimOrNull(formData.get('ssid')),
    password: trimOrNull(formData.get('password')),
    band: trimOrNull(formData.get('band')),
    is_shareable: formData.get('is_shareable') === 'on',
    notes: trimOrNull(formData.get('notes')),
    updated_at: new Date().toISOString(),
  }

  const admin = createAdminClient()
  if (id) {
    const { error } = await admin
      .from('it_networks')
      .update(row)
      .eq('id', id)
      .eq('org_id', session.organization.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await admin.from('it_networks').insert(row)
    if (error) return { error: error.message }
  }

  revalidateAll()
  return { success: id ? 'Network updated.' : 'Network added.' }
}

export async function deleteNetworkAction(formData: FormData) {
  const session = await requireOrgUser()
  const id = trim(formData.get('id'))
  if (!id) return
  const admin = createAdminClient()
  await admin
    .from('it_networks')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)
  revalidateAll()
}

// ----------------------------------------------------------------------------
// Credentials (vendor logins)
// ----------------------------------------------------------------------------
export async function saveCredentialAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser()
  const id = trim(formData.get('id'))
  const serviceName = trim(formData.get('service_name'))
  const category = trim(formData.get('category')) as ItCredentialCategory
  const propertyId = trimOrNull(formData.get('property_id'))

  if (!serviceName) return { error: 'Give the service a name.' }
  if (!CREDENTIAL_CATEGORIES.includes(category)) {
    return { error: 'Pick a category.' }
  }
  if (
    propertyId &&
    !(await ensurePropertyInOrg(session.organization.id, propertyId))
  ) {
    return { error: 'Property not found.' }
  }

  const row = {
    org_id: session.organization.id,
    property_id: propertyId,
    service_name: serviceName,
    category,
    url: trimOrNull(formData.get('url')),
    username: trimOrNull(formData.get('username')),
    password: trimOrNull(formData.get('password')),
    notes: trimOrNull(formData.get('notes')),
    updated_at: new Date().toISOString(),
  }

  const admin = createAdminClient()
  if (id) {
    const { error } = await admin
      .from('it_credentials')
      .update(row)
      .eq('id', id)
      .eq('org_id', session.organization.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await admin.from('it_credentials').insert(row)
    if (error) return { error: error.message }
  }

  revalidateAll()
  return { success: id ? 'Login updated.' : 'Login saved.' }
}

export async function deleteCredentialAction(formData: FormData) {
  const session = await requireOrgUser()
  const id = trim(formData.get('id'))
  if (!id) return
  const admin = createAdminClient()
  await admin
    .from('it_credentials')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)
  revalidateAll()
}

// ----------------------------------------------------------------------------
// Equipment
// ----------------------------------------------------------------------------
export async function saveEquipmentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser()
  const id = trim(formData.get('id'))
  const propertyId = trim(formData.get('property_id'))
  const name = trim(formData.get('name'))
  const category = trim(formData.get('category')) as ItEquipmentCategory
  const status = (trim(formData.get('status')) || 'active') as ItEquipmentStatus

  if (!propertyId) return { error: 'Choose a property.' }
  if (!name) return { error: 'Give the equipment a name.' }
  if (!EQUIPMENT_CATEGORIES.includes(category)) {
    return { error: 'Pick a category.' }
  }
  if (!EQUIPMENT_STATUSES.includes(status)) {
    return { error: 'Pick a status.' }
  }
  if (!(await ensurePropertyInOrg(session.organization.id, propertyId))) {
    return { error: 'Property not found.' }
  }

  const row = {
    org_id: session.organization.id,
    property_id: propertyId,
    name,
    category,
    status,
    location: trimOrNull(formData.get('location')),
    make_model: trimOrNull(formData.get('make_model')),
    serial_number: trimOrNull(formData.get('serial_number')),
    ip_address: trimOrNull(formData.get('ip_address')),
    purchase_date: trimOrNull(formData.get('purchase_date')),
    warranty_until: trimOrNull(formData.get('warranty_until')),
    notes: trimOrNull(formData.get('notes')),
    updated_at: new Date().toISOString(),
  }

  const admin = createAdminClient()
  if (id) {
    const { error } = await admin
      .from('it_equipment')
      .update(row)
      .eq('id', id)
      .eq('org_id', session.organization.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await admin.from('it_equipment').insert(row)
    if (error) return { error: error.message }
  }

  revalidateAll()
  return { success: id ? 'Equipment updated.' : 'Equipment added.' }
}

export async function deleteEquipmentAction(formData: FormData) {
  const session = await requireOrgUser()
  const id = trim(formData.get('id'))
  if (!id) return
  const admin = createAdminClient()
  await admin
    .from('it_equipment')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)
  revalidateAll()
}

// ----------------------------------------------------------------------------
// Vendors
// ----------------------------------------------------------------------------
export async function saveVendorAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgUser()
  const id = trim(formData.get('id'))
  const name = trim(formData.get('name'))
  const vendorType = trim(formData.get('vendor_type')) as ItVendorType
  const propertyId = trimOrNull(formData.get('property_id'))

  if (!name) return { error: 'Vendor name is required.' }
  if (!VENDOR_TYPES.includes(vendorType)) {
    return { error: 'Pick a vendor type.' }
  }
  const email = trimOrNull(formData.get('email'))
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Email must be a valid address.' }
  }
  const website = trimOrNull(formData.get('website'))
  if (website) {
    try {
      new URL(website)
    } catch {
      return { error: 'Website must be a full URL (e.g. https://example.com).' }
    }
  }
  if (
    propertyId &&
    !(await ensurePropertyInOrg(session.organization.id, propertyId))
  ) {
    return { error: 'Property not found.' }
  }

  const row = {
    org_id: session.organization.id,
    property_id: propertyId,
    name,
    vendor_type: vendorType,
    contact_name: trimOrNull(formData.get('contact_name')),
    phone: trimOrNull(formData.get('phone')),
    email,
    website,
    account_number: trimOrNull(formData.get('account_number')),
    support_hours: trimOrNull(formData.get('support_hours')),
    is_emergency: formData.get('is_emergency') === 'on',
    notes: trimOrNull(formData.get('notes')),
    updated_at: new Date().toISOString(),
  }

  const admin = createAdminClient()
  if (id) {
    const { error } = await admin
      .from('it_vendors')
      .update(row)
      .eq('id', id)
      .eq('org_id', session.organization.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await admin.from('it_vendors').insert(row)
    if (error) return { error: error.message }
  }

  revalidateAll()
  return { success: id ? 'Vendor updated.' : 'Vendor added.' }
}

export async function deleteVendorAction(formData: FormData) {
  const session = await requireOrgUser()
  const id = trim(formData.get('id'))
  if (!id) return
  const admin = createAdminClient()
  await admin
    .from('it_vendors')
    .delete()
    .eq('id', id)
    .eq('org_id', session.organization.id)
  revalidateAll()
}
