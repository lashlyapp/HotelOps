-- Per-file display name + description override. R2 stays the source of truth
-- for file existence; this table only annotates files. Display name falls
-- back to humanizeFilename() in app code when no row exists. Orphan rows
-- (file deleted from R2) are harmless.

create table public.media_metadata (
  property_id uuid not null references public.properties(id) on delete cascade,
  file_key text not null,
  display_name text,
  description text,
  updated_at timestamptz not null default now(),
  primary key (property_id, file_key)
);

create index media_metadata_property_idx on public.media_metadata(property_id);

alter table public.media_metadata enable row level security;

create policy media_metadata_select_org
  on public.media_metadata for select
  using (
    public.is_platform_admin() or
    exists (
      select 1
      from public.properties p
      where p.id = media_metadata.property_id
        and p.org_id = public.current_org_id()
    )
  );

-- Writes happen via service role (server actions); no INSERT/UPDATE/DELETE
-- policies needed for v1.
