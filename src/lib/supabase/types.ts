export type AppRole = 'platform_admin' | 'org_owner' | 'org_staff'

export type Organization = {
  id: string
  slug: string
  name: string
  created_at: string
  stripe_customer_id: string | null
  // Org-level add-on intent. When true, every property's subscription
  // carries the matching SubscriptionItem. See docs/pricing.md +
  // 20260514070000_org_addon_flags.sql for the data model.
  signage_unlimited_addon_active: boolean
  guest_experience_addon_active: boolean
  social_studio_addon_active: boolean
  // Self-serve trial window — see 20260515000000_self_service_trial.sql
  // and src/lib/billing/trial.ts. Null on tenants created via the
  // admin path (no trial).
  trial_started_at: string | null
  trial_ends_at: string | null
  // Trial lifecycle bookkeeping — see 20260515010000_signup_otp_and_admin.sql.
  // *_email_sent_at columns dedupe the /api/cron/trial-expiry sender.
  // trial_converted_at is stamped by startSubscriptionForProperty on
  // the first paid sub and powers the admin dashboard's conversion
  // metrics.
  trial_reminder_t3_sent_at: string | null
  trial_expired_email_sent_at: string | null
  trial_converted_at: string | null
  // ISO 4217 lowercase code. Set at signup based on the visitor's
  // locale; immutable thereafter. See 20260515020000_org_currency.sql
  // and src/lib/billing/currency.ts.
  currency: string
  // BCP-47 short code (en / es / fr). Captured at signup and used by
  // cron-driven transactional emails (trial reminders) that have no
  // live request context to read getLocale() from. See
  // 20260515030000_org_locale.sql.
  locale: string
  // UTM attribution captured at signup-form-submission time. See
  // 20260515040000_utm_capture.sql + src/lib/marketing/utm.ts.
  // Persisted forever so the admin dashboard's per-campaign CAC view
  // works historically even after a 90-day attribution window
  // closes. All nullable: organic / direct visitors have no UTMs.
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  referrer: string | null
  // Optional 1-on-1 onboarding session opt-in — see
  // 20260521020000_org_onboarding_session_optin.sql. When true, the
  // $150 hotelops_setup_fee line item is attached to every property's
  // first invoice (per-property pricing).
  wants_onboarding_session: boolean
}

export type Profile = {
  id: string
  org_id: string | null
  role: AppRole
  full_name: string | null
  phone: string | null
  title: string | null
  bio: string | null
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
  // Storage accounting — see 20260514090000_storage_quota.sql.
  storage_used_bytes: number
  storage_used_at: string | null
  storage_quota_bytes: number
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
  folder_id: string | null
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

export type ItDocumentFolder = {
  id: string
  org_id: string
  parent_id: string | null
  name: string
  created_at: string
  created_by: string | null
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
  property_id: string
  org_id: string
  stripe_customer_id: string
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  status: BillingSubscriptionStatus
  past_due_since: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  unit_amount_cents: number | null
  quantity: number
  currency: string
  default_payment_method_id: string | null
  default_payment_brand: string | null
  default_payment_last4: string | null
  // Add-on line items. *_active reflects whether the corresponding Stripe
  // Price is currently a SubscriptionItem on this subscription; *_item_id
  // is the Stripe SubscriptionItem id used when removing the add-on.
  // See docs/pricing.md for the canonical pricing structure.
  signage_unlimited_active: boolean
  signage_unlimited_item_id: string | null
  guest_experience_active: boolean
  guest_experience_item_id: string | null
  social_studio_active: boolean
  social_studio_item_id: string | null
  // Storage overage. quantity = number of 25 GB blocks active beyond
  // the property's storage_quota_bytes. item_id is the Stripe
  // SubscriptionItem id for the overage Price; null when quantity = 0.
  storage_blocks_quantity: number
  storage_blocks_item_id: string | null
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

// ----------------------------------------------------------------------------
// Self-serve signup: in-flight OTP verification rows
// ----------------------------------------------------------------------------
export type SignupPending = {
  id: string
  email: string
  full_name: string
  hotel_name: string
  password_enc: string
  otp_hash: string
  attempts: number
  expires_at: string
  ip_address: string | null
  resends: number
  resent_at: string | null
  // Visitor locale captured at OTP-request time so the OTP email +
  // any resend speak the same language even if the user starts /signup
  // in one tab and finishes /signup/verify in another.
  locale: string
  // UTM attribution captured from the signup-form hidden inputs.
  // Copied to organizations on OTP verify; nullable for organic
  // signups.
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  referrer: string | null
  // Optional 1-on-1 onboarding session opt-in. Mirrors the checkbox
  // on the /signup form and is copied onto organizations on OTP
  // verify. See 20260521020000_org_onboarding_session_optin.sql.
  wants_onboarding_session: boolean
  created_at: string
}

// ----------------------------------------------------------------------------
// Public signup requests (the /signup form audit log)
// ----------------------------------------------------------------------------
export type TenantSignupStatus = 'pending' | 'approved' | 'rejected'

export type TenantSignupRequest = {
  id: string
  email: string
  full_name: string
  hotel_name: string
  phone: string | null
  message: string | null
  status: TenantSignupStatus
  approved_org_id: string | null
  approved_at: string | null
  approved_by: string | null
  rejection_reason: string | null
  rejected_at: string | null
  rejected_by: string | null
  agreed_at: string | null
  agreed_terms_version: string | null
  agreed_privacy_version: string | null
  ip_address: string | null
  email_verified_at: string | null
  email_verification_token: string | null
  email_verification_sent_at: string | null
  created_at: string
}

// ----------------------------------------------------------------------------
// Work orders (Kanban) — see docs/work-orders-spec.md.
// Was historically named "tasks"; renamed in migration 20260514080000.
// ----------------------------------------------------------------------------
export type WorkOrderStatus = 'open' | 'in_progress' | 'waiting' | 'done'
export type WorkOrderPriority = 'low' | 'normal' | 'high' | 'urgent'
export type WorkOrderCategory =
  | 'plumbing'
  | 'electrical'
  | 'hvac'
  | 'appliance'
  | 'furniture'
  | 'fixtures'
  | 'flooring'
  | 'paint_wall'
  | 'door_lock'
  | 'window'
  | 'lighting'
  | 'tv_av'
  | 'pool_spa'
  | 'landscaping'
  | 'pest'
  | 'housekeeping'
  | 'lost_found'
  | 'amenities'
  | 'cleanliness'
  | 'guest_request'
  | 'safety'
  | 'it'
  | 'other'

export type WorkOrderAttachmentKind = 'photo' | 'video'
export type WorkOrderAttachmentPhase = 'before' | 'progress' | 'after'

export type WorkOrder = {
  id: string
  org_id: string
  property_id: string
  reference: string
  title: string
  description: string | null
  status: WorkOrderStatus
  priority: WorkOrderPriority
  category: WorkOrderCategory
  location: string | null
  assignee_id: string | null
  created_by: string | null
  created_by_email: string | null
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
  updated_at: string
}

export type WorkOrderAttachment = {
  id: string
  work_order_id: string
  org_id: string
  kind: WorkOrderAttachmentKind
  r2_key: string
  poster_key: string | null
  filename: string
  content_type: string | null
  size_bytes: number
  caption: string | null
  phase: WorkOrderAttachmentPhase
  uploaded_by: string | null
  created_at: string
}

export type WorkOrderComment = {
  id: string
  work_order_id: string
  org_id: string
  body: string
  author_id: string | null
  author_email: string | null
  created_at: string
}

export type WorkOrderActivityKind =
  | 'created'
  | 'assigned'
  | 'unassigned'
  | 'status'
  | 'priority'
  | 'attachment'
  | 'comment'
  | 'forced_done'
  | 'deleted'

export type WorkOrderActivity = {
  id: string
  work_order_id: string
  org_id: string
  kind: WorkOrderActivityKind
  from_value: string | null
  to_value: string | null
  note: string | null
  actor_id: string | null
  actor_email: string | null
  created_at: string
}

export type WorkOrderTag = {
  id: string
  work_order_id: string
  org_id: string
  tag: string
  created_at: string
}

// ----------------------------------------------------------------------------
// Digital signage — see docs/signage-spec.md
// ----------------------------------------------------------------------------
export type SignageItemKind = 'image' | 'video' | 'web' | 'text'

export type SignageScreen = {
  id: string
  org_id: string
  property_id: string
  nickname: string
  player_token: string
  pairing_code: string | null
  pairing_code_expires_at: string | null
  last_heartbeat_at: string | null
  last_user_agent: string | null
  current_item_id: string | null
  emergency_message: string | null
  emergency_until: string | null
  created_at: string
  updated_at: string
}

export type SignagePlaylist = {
  id: string
  org_id: string
  property_id: string
  name: string
  is_default: boolean
  created_at: string
  updated_at: string
}

// payload shapes by kind. Keep these loose at the type level — the server
// actions validate the contents before persisting.
export type SignageItemPayload =
  | { r2_key: string; poster_key?: string | null }     // image / video
  | { url: string }                                     // web
  | {                                                   // text
      heading: string
      subheading?: string | null
      background?: string | null
      color?: string | null
    }

export type SignagePlaylistItem = {
  id: string
  playlist_id: string
  org_id: string
  kind: SignageItemKind
  payload: SignageItemPayload
  duration_seconds: number
  sort_order: number
  created_at: string
}

export type SignageSchedule = {
  id: string
  screen_id: string
  playlist_id: string
  org_id: string
  starts_on: string | null
  ends_on: string | null
  start_time: string | null
  end_time: string | null
  priority: number
  created_at: string
}

// ----------------------------------------------------------------------------
// Arrival experience — see docs/arrival-spec.md
// ----------------------------------------------------------------------------
export type ArrivalSectionKind = 'info' | 'menu' | 'event' | 'marketing'

export type ArrivalQuickInfoEntry = { label: string; value: string }

export type ArrivalPage = {
  id: string
  org_id: string
  property_id: string
  public_slug: string
  brand_color: string | null
  welcome_heading: string | null
  welcome_body: string | null
  quick_info: ArrivalQuickInfoEntry[]
  checkout_time: string | null
  parking: string | null
  pet_policy: string | null
  smoking_policy: string | null
  contact_phone: string | null
  hidden_network_ids: string[]
  published_at: string | null
  created_at: string
  updated_at: string
}

export type ArrivalInfoItem = {
  id: string
  title: string
  subtitle?: string | null
  body?: string | null
  hours?: string | null
  image_key?: string | null
  url?: string | null
}

export type ArrivalMenuItem = {
  id: string
  name: string
  description?: string | null
  price?: string | null
  image_key?: string | null
  diet?: string[]
}

export type ArrivalMenuGroup = {
  id: string
  name: string
  items: ArrivalMenuItem[]
}

export type ArrivalSectionBody =
  | { items: ArrivalInfoItem[] }            // info / event / marketing
  | { groups: ArrivalMenuGroup[] }          // menu

export type ArrivalSection = {
  id: string
  page_id: string
  org_id: string
  kind: ArrivalSectionKind
  title: string
  body: ArrivalSectionBody
  sort_order: number
  is_published: boolean
  created_at: string
  updated_at: string
}

// ----------------------------------------------------------------------------
// Social post assistant — see 20260520010000_social_post_assistant.sql
// ----------------------------------------------------------------------------
export type BrandVoice =
  | 'warm'
  | 'luxury'
  | 'boutique'
  | 'family'
  | 'casual'
  | 'playful'

export type PropertySocialSettings = {
  property_id: string
  org_id: string
  brand_voice: BrandVoice
  signature_hashtags: string | null
  social_handles: string | null
  created_at: string
  updated_at: string
}

export type SocialMediaCredit = {
  source: 'unsplash'
  photographer_name: string
  photographer_url: string
  source_url: string
}

export type SocialPostLog = {
  id: string
  property_id: string
  org_id: string
  // YYYY-MM-DD — the day this post was generated for. Unique with
  // property_id so the cron upserts cleanly within a single UTC day.
  post_date: string
  topic: string
  captions: string[]
  // Parallel array to `captions`: AI-suggested hashtags per variant.
  // GM-configured signature hashtags live on property_social_settings
  // and are appended on top at copy/email time.
  hashtag_sets: string[][]
  // R2 key when the photo came from the property's own media catalog.
  // Mutually exclusive with external_media_url.
  media_key: string | null
  // Full https URL when the photo came from outside (Unsplash today).
  // Mutually exclusive with media_key.
  external_media_url: string | null
  // Stable id from the external source (Unsplash photo id). Lets the
  // next day's generator skip photos used in the last 30 days for
  // this property so the same stock shot doesn't cycle weekly. Null
  // for catalog posts and for pre-2026-05 rows.
  external_media_id: string | null
  // Required attribution when external_media_url is set; null otherwise.
  external_media_credit: SocialMediaCredit | null
  marked_used_at: string | null
  created_at: string
}

export type SocialCaptionFeedback = {
  id: string
  property_id: string
  org_id: string
  caption: string
  topic: string
  liked: boolean
  voter_id: string | null
  created_at: string
  updated_at: string
}

// ----------------------------------------------------------------------------
// Revenue Intelligence — see 20260522000000_revenue_intelligence.sql
// ----------------------------------------------------------------------------

export type MarketSegment =
  | 'economy'
  | 'midscale'
  | 'upscale'
  | 'luxury'
  | 'lifestyle'
  | 'boutique'

export type DemandOutlook = 'soft' | 'steady' | 'strong' | 'compressed'

export type SignalConfidence = 'low' | 'medium' | 'high'

export type DemandSignalType =
  | 'convention'
  | 'concert'
  | 'sports'
  | 'festival'
  | 'holiday'
  | 'seasonal'
  | 'compression'

export type RecommendationType =
  | 'rate_increase'
  | 'rate_hold'
  | 'rate_decrease'
  | 'parity_alert'
  | 'visibility_gap'

export type CompetitorArchetype =
  | 'similar_boutique'
  | 'lifestyle_peer'
  | 'upscale_chain'
  | 'independent_peer'

export type PropertyMarketProfile = {
  property_id: string
  org_id: string
  market_segment: MarketSegment
  tier: number
  adr_floor: number | null
  adr_ceiling: number | null
  location_descriptor: string | null
  amenity_tags: string | null
  operator_confirmed: boolean
  detected_at: string
  updated_at: string
  // Customer-provided external identifiers for review intelligence.
  // Added by 20260522020000_revenue_intelligence_expansion.sql.
  tripadvisor_url: string | null
  google_place_id: string | null
}

export type PropertyCompetitor = {
  id: string
  property_id: string
  org_id: string
  competitor_name: string
  archetype: CompetitorArchetype
  distance_km: number | null
  adr_floor: number | null
  adr_ceiling: number | null
  match_score: number
  external_source: string | null
  external_id: string | null
  created_at: string
}

export type MarketDemandSignal = {
  id: string
  property_id: string
  org_id: string
  signal_date: string
  signal_key: string
  signal_type: DemandSignalType
  headline: string
  intensity: number
  confidence: SignalConfidence
  context: Record<string, unknown>
  created_at: string
}

export type PricingRecommendation = {
  id: string
  property_id: string
  org_id: string
  target_date: string
  recommendation_key: string
  recommendation_type: RecommendationType
  headline: string
  rationale: string | null
  suggested_delta: number | null
  priority: number
  confidence: SignalConfidence
  contributing_signals: string[]
  acted_at: string | null
  created_at: string
}

export type DailyMarketBriefing = {
  id: string
  property_id: string
  org_id: string
  briefing_date: string
  headline: string
  body: string
  opportunity_count: number
  alert_count: number
  demand_outlook: DemandOutlook
  source_signal_ids: string[]
  created_at: string
}

// L3 signal tables added in 20260522020000_revenue_intelligence_expansion.sql

export type ReviewSentimentSignal = {
  id: string
  property_id: string
  org_id: string
  observed_at: string
  window_days: number
  rating_avg: number | null
  rating_delta_vs_prev: number | null
  review_count_window: number
  sentiment_avg: number | null
  top_complaint_theme: string | null
  top_praise_theme: string | null
  competitor_avg: number | null
  vs_competitor_delta: number | null
}

export type SearchIntentSignal = {
  id: string
  property_id: string
  org_id: string
  observed_at: string
  destination_demand_score: number | null
  wow_change_pct: number | null
  yoy_change_pct: number | null
  pageview_avg_7d: number | null
  pageview_avg_28d: number | null
  trending_up: boolean
}

export type WeatherDisruptionSignal = {
  id: string
  property_id: string
  org_id: string
  signal_date: string
  kind: string
  intensity: number
  headline: string
  effective_at: string | null
  ends_at: string | null
  source: string
  source_external_id: string | null
}
