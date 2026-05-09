-- IT Hub: centralizes Wi-Fi networks, vendor logins, equipment, and IT vendor
-- contacts for a hotel property. The audience is non-technical (GMs, FOH staff)
-- so categories and labels stay in plain language.

-- ----------------------------------------------------------------------------
-- it_networks: Wi-Fi networks (guest, staff, BOH, event, IoT)
-- ----------------------------------------------------------------------------
create table public.it_networks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  label text not null,
  network_type text not null
    check (network_type in ('guest','staff','boh','event','iot','other')),
  ssid text,
  password text,
  band text,
  is_shareable boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index it_networks_org_idx on public.it_networks(org_id);
create index it_networks_property_idx on public.it_networks(property_id);

-- ----------------------------------------------------------------------------
-- it_credentials: vendor / software portal logins (PMS, OTAs, social, etc.)
-- ----------------------------------------------------------------------------
create table public.it_credentials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  service_name text not null,
  category text not null
    check (category in (
      'pms','booking','channel','social','accounting','utility',
      'email','marketing','security','other'
    )),
  url text,
  username text,
  password text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index it_credentials_org_idx on public.it_credentials(org_id);
create index it_credentials_property_idx on public.it_credentials(property_id);

-- ----------------------------------------------------------------------------
-- it_equipment: TVs, routers, printers, POS, phones, cameras, smart locks
-- ----------------------------------------------------------------------------
create table public.it_equipment (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  category text not null
    check (category in (
      'router','switch','access_point','tv','printer','phone',
      'pos','camera','smart_lock','computer','tablet','speaker','other'
    )),
  location text,
  make_model text,
  serial_number text,
  ip_address text,
  purchase_date date,
  warranty_until date,
  status text not null default 'active'
    check (status in ('active','spare','retired','broken')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index it_equipment_org_idx on public.it_equipment(org_id);
create index it_equipment_property_idx on public.it_equipment(property_id);

-- ----------------------------------------------------------------------------
-- it_vendors: ISPs, IT support, software providers, phone systems
-- ----------------------------------------------------------------------------
create table public.it_vendors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  name text not null,
  vendor_type text not null
    check (vendor_type in (
      'isp','it_support','software','phone','tv_cable','security','other'
    )),
  contact_name text,
  phone text,
  email text,
  website text,
  account_number text,
  support_hours text,
  is_emergency boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index it_vendors_org_idx on public.it_vendors(org_id);
create index it_vendors_property_idx on public.it_vendors(property_id);

-- ----------------------------------------------------------------------------
-- RLS: org members read their own org's IT data. Writes go through server
-- actions using the service-role admin client (matches the rest of the app).
-- ----------------------------------------------------------------------------
alter table public.it_networks enable row level security;
alter table public.it_credentials enable row level security;
alter table public.it_equipment enable row level security;
alter table public.it_vendors enable row level security;

create policy it_networks_select_org
  on public.it_networks for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy it_credentials_select_org
  on public.it_credentials for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy it_equipment_select_org
  on public.it_equipment for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy it_vendors_select_org
  on public.it_vendors for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
