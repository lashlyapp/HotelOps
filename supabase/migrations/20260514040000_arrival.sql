-- Guest arrival experience: a printable, informational landing page the
-- hotel hands to guests via a QR card in the room.
-- Spec: docs/arrival-spec.md
--
-- One arrival page per property. Sections (dining hours, amenities, menus,
-- events, marketing) carry structured JSON the public page renders. Wi-Fi
-- data comes from the existing it_networks table — operators flip the
-- shareable flag and the network shows up automatically.

create type public.arrival_section_kind as enum (
  'info',           -- dining hours, gym, lobby info: title + body + photo cards
  'menu',           -- restaurant / room service: groups of named items + prices
  'event',          -- local events / things to do
  'marketing'       -- up to N promotional banners
);

create table public.arrival_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null unique
    references public.properties(id) on delete cascade,
  -- /a/<public_slug>. Defaults to property.slug at create time; operator
  -- can shorten or otherwise rebrand without renaming the property.
  public_slug text not null
    check (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  brand_color text,
  welcome_heading text
    check (welcome_heading is null or char_length(welcome_heading) <= 120),
  welcome_body text
    check (welcome_body is null or char_length(welcome_body) <= 2000),
  -- [{label, value}, ...] free-form key/value list for checkout time,
  -- parking, etc. Limited at the action site (max 12 pairs).
  quick_info jsonb not null default '[]',
  checkout_time text,
  parking text,
  pet_policy text,
  smoking_policy text,
  contact_phone text,
  -- List of it_networks.id to hide from the page. The IT Hub table holds
  -- the source of truth; we surface every it_networks row with
  -- `is_shareable = true` minus any listed here.
  hidden_network_ids uuid[] not null default '{}',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index arrival_pages_public_slug_idx
  on public.arrival_pages(public_slug);

create table public.arrival_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.arrival_pages(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind public.arrival_section_kind not null,
  -- Operator-facing label (e.g. "Breakfast", "Things to do nearby").
  title text not null check (char_length(title) between 1 and 120),
  -- Schema by kind:
  --   info / event / marketing -> { items: [{ id, title, subtitle?, body?,
  --                                            hours?, image_key?, url? }] }
  --   menu                     -> { groups: [{ id, name, items:
  --                                            [{ id, name, description?,
  --                                               price?, image_key?,
  --                                               diet?: string[] }] }] }
  body jsonb not null default '{}',
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index arrival_sections_page_idx
  on public.arrival_sections(page_id, sort_order);

-- ----------------------------------------------------------------------------
-- RLS: standard org-scoped read for operators; service role bypasses for
-- the public /a/<slug> renderer (which reads via the admin client).
-- ----------------------------------------------------------------------------
alter table public.arrival_pages enable row level security;
alter table public.arrival_sections enable row level security;

create policy arrival_pages_select_org on public.arrival_pages for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy arrival_sections_select_org on public.arrival_sections for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
