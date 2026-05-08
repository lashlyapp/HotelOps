-- HotelOps initial schema
-- Multi-tenant SaaS: organizations own properties; profiles belong to organizations.

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- organizations: top-level tenant (e.g. CG Hotel Group)
-- ----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- profiles: app users, 1:1 with auth.users, scoped to a single org for v1
-- ----------------------------------------------------------------------------
create type public.app_role as enum ('platform_admin', 'org_owner', 'org_staff');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  role public.app_role not null default 'org_owner',
  full_name text,
  created_at timestamptz not null default now()
);

create index profiles_org_id_idx on public.profiles(org_id);

-- ----------------------------------------------------------------------------
-- properties: hotels owned by an org. r2_prefix is the folder in the R2 bucket.
-- ----------------------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  r2_prefix text not null,
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);

create index properties_org_id_idx on public.properties(org_id);

-- ----------------------------------------------------------------------------
-- invoices: offline (check) billing for v1
-- ----------------------------------------------------------------------------
create type public.invoice_status as enum ('pending', 'paid', 'void');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'USD',
  status public.invoice_status not null default 'pending',
  period_start date not null,
  period_end date not null,
  due_date date,
  paid_at timestamptz,
  payment_method text,
  notes text,
  created_at timestamptz not null default now()
);

create index invoices_org_id_idx on public.invoices(org_id);
create index invoices_status_idx on public.invoices(status);

-- ----------------------------------------------------------------------------
-- helpers used by RLS policies
-- ----------------------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'platform_admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- RLS: every table locked down. Policies grant access by org membership.
-- ----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.invoices enable row level security;

-- organizations: members read their own; platform admins read all.
create policy organizations_select_member
  on public.organizations for select
  using (id = public.current_org_id() or public.is_platform_admin());

-- profiles: a user can read their own profile; platform admins read all.
create policy profiles_select_self
  on public.profiles for select
  using (id = auth.uid() or public.is_platform_admin());

create policy profiles_update_self
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- properties: members of the org can read; platform admins read all.
create policy properties_select_org
  on public.properties for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

-- invoices: org members read their own org's invoices; platform admins read all.
create policy invoices_select_org
  on public.invoices for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

-- Writes for organizations / properties / invoices are admin-only and happen
-- via the service role (which bypasses RLS), so no INSERT/UPDATE/DELETE
-- policies are added here for v1.
