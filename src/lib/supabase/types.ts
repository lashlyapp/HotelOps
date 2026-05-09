export type AppRole = 'platform_admin' | 'org_owner' | 'org_staff'
export type InvoiceStatus = 'pending' | 'paid' | 'void'

export type Organization = {
  id: string
  slug: string
  name: string
  created_at: string
}

export type Profile = {
  id: string
  org_id: string | null
  role: AppRole
  full_name: string | null
  created_at: string
}

export type Property = {
  id: string
  org_id: string
  slug: string
  name: string
  r2_prefix: string
  created_at: string
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
  phone: string | null
  email: string | null
  website: string | null
  description: string | null
  logo_key: string | null
  logo_uploaded_at: string | null
}

export type ItNetworkType = 'guest' | 'staff' | 'boh' | 'event' | 'iot' | 'other'

export type ItNetwork = {
  id: string
  org_id: string
  property_id: string
  label: string
  network_type: ItNetworkType
  ssid: string | null
  password: string | null
  band: string | null
  is_shareable: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export type ItCredentialCategory =
  | 'pms'
  | 'booking'
  | 'channel'
  | 'social'
  | 'accounting'
  | 'utility'
  | 'email'
  | 'marketing'
  | 'security'
  | 'other'

export type ItCredential = {
  id: string
  org_id: string
  property_id: string | null
  service_name: string
  category: ItCredentialCategory
  url: string | null
  username: string | null
  password: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type ItEquipmentCategory =
  | 'router'
  | 'switch'
  | 'access_point'
  | 'tv'
  | 'printer'
  | 'phone'
  | 'pos'
  | 'camera'
  | 'smart_lock'
  | 'computer'
  | 'tablet'
  | 'speaker'
  | 'other'

export type ItEquipmentStatus = 'active' | 'spare' | 'retired' | 'broken'

export type ItEquipment = {
  id: string
  org_id: string
  property_id: string
  name: string
  category: ItEquipmentCategory
  location: string | null
  make_model: string | null
  serial_number: string | null
  ip_address: string | null
  purchase_date: string | null
  warranty_until: string | null
  status: ItEquipmentStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export type ItVendorType =
  | 'isp'
  | 'it_support'
  | 'software'
  | 'phone'
  | 'tv_cable'
  | 'security'
  | 'other'

export type ItVendor = {
  id: string
  org_id: string
  property_id: string | null
  name: string
  vendor_type: ItVendorType
  contact_name: string | null
  phone: string | null
  email: string | null
  website: string | null
  account_number: string | null
  support_hours: string | null
  is_emergency: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export type Invoice = {
  id: string
  org_id: string
  amount_cents: number
  currency: string
  status: InvoiceStatus
  period_start: string
  period_end: string
  due_date: string | null
  paid_at: string | null
  payment_method: string | null
  notes: string | null
  created_at: string
}
