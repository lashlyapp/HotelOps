-- IT Hub: document repository (contracts, runbooks, presentations, manuals,
-- network diagrams, warranties, licenses, policies). Files live in R2 under
-- a hidden `_it-docs/` subprefix; this table holds metadata only.

create table public.it_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  title text not null,
  category text not null
    check (category in (
      'contract','runbook','presentation','manual','network_diagram',
      'license','warranty','invoice','policy','other'
    )),
  r2_key text not null unique,
  file_name text not null,
  content_type text,
  size_bytes bigint not null default 0,
  expires_at date,
  notes text,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index it_documents_org_idx on public.it_documents(org_id);
create index it_documents_property_idx on public.it_documents(property_id);
create index it_documents_category_idx on public.it_documents(category);
create index it_documents_expires_at_idx on public.it_documents(expires_at)
  where expires_at is not null;

alter table public.it_documents enable row level security;

create policy it_documents_select_org
  on public.it_documents for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
