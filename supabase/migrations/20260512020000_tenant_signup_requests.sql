-- Public signup requests. The marketing site /signup form inserts a row
-- here with status='pending'; platform admins review on /admin and either
-- approve (which kicks off the existing tenant-provisioning flow) or
-- reject (with a reason for the audit trail).
--
-- Crucially this does NOT create a Supabase auth user — that happens only
-- on approve, mirroring the existing createTenantAction code path. So an
-- inbox flooded with bot signups doesn't pollute auth.users.

create type public.tenant_signup_status as enum (
  'pending',
  'approved',
  'rejected'
);

create table public.tenant_signup_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  hotel_name text not null,
  phone text,
  message text,
  status public.tenant_signup_status not null default 'pending',
  -- Set on approve: links the signup to the org we provisioned for it, so
  -- admins can jump from a signup row to the tenant detail page.
  approved_org_id uuid references public.organizations(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  rejected_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index tenant_signup_requests_status_idx
  on public.tenant_signup_requests(status, created_at desc);
create index tenant_signup_requests_email_idx
  on public.tenant_signup_requests(lower(email));

-- ------------------------------------------------------------------
-- RLS: anonymous public can INSERT (the /signup form posts unauthed).
-- Reads + updates are platform-admin only — service role bypasses RLS,
-- which is what the admin-side server actions already use via
-- createAdminClient(), so the only policy we strictly need is the
-- anon-insert one. Belt-and-suspenders policies follow.
-- ------------------------------------------------------------------
alter table public.tenant_signup_requests enable row level security;

-- Anyone (incl. unauthenticated visitors) can insert a signup request.
-- Status is forced to 'pending' on insert so a malicious caller can't
-- self-approve.
create policy tenant_signup_requests_anon_insert
  on public.tenant_signup_requests for insert
  with check (status = 'pending');

-- Platform admins can read every signup. Org members / non-admins
-- have no select policy, so they see nothing.
create policy tenant_signup_requests_select_platform_admin
  on public.tenant_signup_requests for select
  using (public.is_platform_admin());

-- No update / delete policies for any non-service-role caller — admin
-- approve / reject runs through service-role server actions.
