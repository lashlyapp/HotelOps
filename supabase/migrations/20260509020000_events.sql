-- Events: catering, weddings, corporate bookings, parties — anything that
-- needs advance planning, a proposal, and coordination across spaces, F&B,
-- and operations. v1 covers inquiry → tentative → proposal → definite →
-- in-progress → completed/cancelled, with offline payment tracking.

-- ----------------------------------------------------------------------------
-- event_spaces: bookable rooms/areas at a property (Ballroom, Garden, etc.)
-- ----------------------------------------------------------------------------
create table public.event_spaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  capacity_seated integer check (capacity_seated is null or capacity_seated >= 0),
  capacity_standing integer check (capacity_standing is null or capacity_standing >= 0),
  hourly_rate_cents integer check (hourly_rate_cents is null or hourly_rate_cents >= 0),
  flat_rate_cents integer check (flat_rate_cents is null or flat_rate_cents >= 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_spaces_org_idx on public.event_spaces(org_id);
create index event_spaces_property_idx on public.event_spaces(property_id);

-- ----------------------------------------------------------------------------
-- events: the deal. status drives the UI workflow. proposal_token is the
-- unguessable URL slug for the public client view; null until first sent.
-- ----------------------------------------------------------------------------
create type public.event_status as enum (
  'inquiry',
  'tentative',
  'proposal_sent',
  'definite',
  'in_progress',
  'completed',
  'cancelled',
  'lost'
);

create type public.event_type as enum (
  'wedding',
  'corporate',
  'social',
  'catering',
  'meeting',
  'other'
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  -- Sequential per-org reference like "EVT-0042" for humans to quote.
  reference text not null,
  name text not null,
  event_type public.event_type not null default 'other',
  status public.event_status not null default 'inquiry',
  -- Primary date/time. Multi-space schedules live in event_schedule_blocks.
  starts_at timestamptz,
  ends_at timestamptz,
  guests_expected integer check (guests_expected is null or guests_expected >= 0),
  guests_guaranteed integer check (guests_guaranteed is null or guests_guaranteed >= 0),
  guests_actual integer check (guests_actual is null or guests_actual >= 0),
  -- Client contact (denormalized — we don't have a contacts table yet).
  contact_name text,
  contact_email text,
  contact_phone text,
  contact_company text,
  -- Pricing snapshot. Line items hold the truth; these are cached totals
  -- recomputed on every line-item write.
  subtotal_cents integer not null default 0,
  service_charge_pct numeric(5,2) not null default 0,
  tax_pct numeric(5,2) not null default 0,
  total_cents integer not null default 0,
  -- Public proposal link. Tokenized so the URL can't be guessed.
  proposal_token text unique,
  proposal_sent_at timestamptz,
  proposal_viewed_at timestamptz,
  proposal_responded_at timestamptz,
  proposal_response text check (proposal_response in ('accepted','declined') or proposal_response is null),
  internal_notes text,
  source text,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, reference)
);

create index events_org_idx on public.events(org_id);
create index events_property_idx on public.events(property_id);
create index events_status_idx on public.events(status);
create index events_starts_at_idx on public.events(starts_at);
create index events_proposal_token_idx on public.events(proposal_token)
  where proposal_token is not null;

-- ----------------------------------------------------------------------------
-- event_schedule_blocks: a single event can use multiple spaces over time
-- (Garden ceremony → Foyer cocktails → Ballroom dinner). Each block ties a
-- space to a time range with a setup style.
-- ----------------------------------------------------------------------------
create table public.event_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  space_id uuid references public.event_spaces(id) on delete set null,
  label text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  setup_style text,
  notes text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index event_schedule_blocks_event_idx on public.event_schedule_blocks(event_id);
create index event_schedule_blocks_org_idx on public.event_schedule_blocks(org_id);
create index event_schedule_blocks_starts_at_idx on public.event_schedule_blocks(starts_at);

-- ----------------------------------------------------------------------------
-- event_line_items: priced line items grouped into sections. Freeform in v1
-- (no menu/package library yet).
-- ----------------------------------------------------------------------------
create type public.event_line_section as enum (
  'venue',
  'food',
  'beverage',
  'av',
  'staffing',
  'rentals',
  'other'
);

create table public.event_line_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  section public.event_line_section not null default 'other',
  description text not null,
  quantity numeric(10,2) not null default 1 check (quantity >= 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  -- Whether service charge / tax apply to this line. Venue fees often
  -- exempt from service charge; tax-exempt orgs need this control too.
  taxable boolean not null default true,
  service_chargeable boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index event_line_items_event_idx on public.event_line_items(event_id);
create index event_line_items_org_idx on public.event_line_items(org_id);

-- ----------------------------------------------------------------------------
-- event_payments: offline-only in v1 (check, cash, ACH, wire, card-on-file
-- recorded outside the system). Sums up against the event total.
-- ----------------------------------------------------------------------------
create type public.event_payment_method as enum (
  'check',
  'cash',
  'ach',
  'wire',
  'card',
  'other'
);

create table public.event_payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  method public.event_payment_method not null default 'check',
  received_at date not null default current_date,
  reference text,
  notes text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index event_payments_event_idx on public.event_payments(event_id);
create index event_payments_org_idx on public.event_payments(org_id);

-- ----------------------------------------------------------------------------
-- event_activity: append-only audit log. Every status change, edit, send,
-- and external event (proposal viewed, accepted) leaves a row.
-- ----------------------------------------------------------------------------
create table public.event_activity (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- Free-form kind so we don't migrate every time we add an event type.
  -- Examples: 'created', 'status_changed', 'proposal_sent',
  -- 'proposal_viewed', 'proposal_accepted', 'note_added', 'payment_recorded'.
  kind text not null,
  message text not null,
  -- Actor: an authed user, or null when the actor is the public proposal client.
  actor_id uuid references auth.users(id) on delete set null,
  actor_label text,
  created_at timestamptz not null default now()
);

create index event_activity_event_idx on public.event_activity(event_id);
create index event_activity_org_idx on public.event_activity(org_id);

-- ----------------------------------------------------------------------------
-- RLS. Reads scoped to the caller's org; writes go through service-role
-- server actions (which bypass RLS), matching the existing pattern.
-- The public proposal page reads via a different path (admin client +
-- proposal_token lookup), so it does NOT need its own anon RLS policy.
-- ----------------------------------------------------------------------------
alter table public.event_spaces enable row level security;
alter table public.events enable row level security;
alter table public.event_schedule_blocks enable row level security;
alter table public.event_line_items enable row level security;
alter table public.event_payments enable row level security;
alter table public.event_activity enable row level security;

create policy event_spaces_select_org
  on public.event_spaces for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy events_select_org
  on public.events for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy event_schedule_blocks_select_org
  on public.event_schedule_blocks for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy event_line_items_select_org
  on public.event_line_items for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy event_payments_select_org
  on public.event_payments for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy event_activity_select_org
  on public.event_activity for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
