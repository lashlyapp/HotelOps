-- IT Hub: user-defined folders for documents. Folders are org-wide (not
-- scoped to a property) and can nest (parent_id self-reference) to give
-- OneDrive-style browsing. Folders layer on top of the existing `category`
-- field as an independent grouping axis; documents may live outside any
-- folder (folder_id null = root / "Unfiled").

create table public.it_document_folders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid references public.it_document_folders(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  -- Folder names must be unique within a parent so the breadcrumb stays
  -- unambiguous. We index parent_id (treating null as "(root)") via two
  -- partial unique indexes since PostgreSQL treats nulls as distinct in
  -- multi-column unique constraints.
  constraint it_document_folders_self_parent_check
    check (parent_id is null or parent_id <> id)
);

create unique index it_document_folders_unique_in_parent
  on public.it_document_folders (org_id, parent_id, lower(name))
  where parent_id is not null;

create unique index it_document_folders_unique_in_root
  on public.it_document_folders (org_id, lower(name))
  where parent_id is null;

create index it_document_folders_org_idx on public.it_document_folders(org_id);
create index it_document_folders_parent_idx
  on public.it_document_folders(parent_id)
  where parent_id is not null;

alter table public.it_document_folders enable row level security;

create policy it_document_folders_select_org
  on public.it_document_folders for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

alter table public.it_documents
  add column folder_id uuid
    references public.it_document_folders(id) on delete set null;

create index it_documents_folder_idx on public.it_documents(folder_id)
  where folder_id is not null;
