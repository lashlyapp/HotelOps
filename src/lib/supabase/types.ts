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

export type ItDocumentCategory =
  | 'contract'
  | 'runbook'
  | 'presentation'
  | 'manual'
  | 'network_diagram'
  | 'license'
  | 'warranty'
  | 'invoice'
  | 'policy'
  | 'other'

export type ItDocument = {
  id: string
  org_id: string
  property_id: string | null
  title: string
  category: ItDocumentCategory
  r2_key: string
  file_name: string
  content_type: string | null
  size_bytes: number
  expires_at: string | null
  notes: string | null
  uploaded_by: string | null
  uploaded_by_email: string | null
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

// ----------------------------------------------------------------------------
// Stripe-backed billing
// ----------------------------------------------------------------------------
export type BillingSubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'

export type BillingSubscription = {
  org_id: string
  stripe_customer_id: string
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  status: BillingSubscriptionStatus
  trial_end: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  default_payment_method_id: string | null
  default_payment_brand: string | null
  default_payment_last4: string | null
  created_at: string
  updated_at: string
}

// ----------------------------------------------------------------------------
// Events
// ----------------------------------------------------------------------------
export type EventStatus =
  | 'inquiry'
  | 'tentative'
  | 'proposal_sent'
  | 'definite'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'lost'

export type EventType =
  | 'wedding'
  | 'corporate'
  | 'social'
  | 'catering'
  | 'meeting'
  | 'other'

export type EventLineSection =
  | 'venue'
  | 'food'
  | 'beverage'
  | 'av'
  | 'staffing'
  | 'rentals'
  | 'other'

export type EventPaymentMethod =
  | 'check'
  | 'cash'
  | 'ach'
  | 'wire'
  | 'card'
  | 'other'

export type EventProposalResponse = 'accepted' | 'declined'

export type EventSpace = {
  id: string
  org_id: string
  property_id: string
  name: string
  capacity_seated: number | null
  capacity_standing: number | null
  hourly_rate_cents: number | null
  flat_rate_cents: number | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Event = {
  id: string
  org_id: string
  property_id: string
  reference: string
  name: string
  event_type: EventType
  status: EventStatus
  starts_at: string | null
  ends_at: string | null
  guests_expected: number | null
  guests_guaranteed: number | null
  guests_actual: number | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  contact_company: string | null
  subtotal_cents: number
  service_charge_pct: number
  tax_pct: number
  total_cents: number
  proposal_token: string | null
  proposal_sent_at: string | null
  proposal_viewed_at: string | null
  proposal_responded_at: string | null
  proposal_response: EventProposalResponse | null
  internal_notes: string | null
  source: string | null
  owner_id: string | null
  created_at: string
  updated_at: string
}

export type EventScheduleBlock = {
  id: string
  event_id: string
  org_id: string
  space_id: string | null
  label: string
  starts_at: string
  ends_at: string
  setup_style: string | null
  notes: string | null
  created_at: string
}

export type EventLineItem = {
  id: string
  event_id: string
  org_id: string
  section: EventLineSection
  description: string
  quantity: number
  unit_price_cents: number
  taxable: boolean
  service_chargeable: boolean
  sort_order: number
  created_at: string
}

export type EventPayment = {
  id: string
  event_id: string
  org_id: string
  amount_cents: number
  method: EventPaymentMethod
  received_at: string
  reference: string | null
  notes: string | null
  recorded_by: string | null
  created_at: string
}

export type EventActivity = {
  id: string
  event_id: string
  org_id: string
  kind: string
  message: string
  actor_id: string | null
  actor_label: string | null
  created_at: string
}
