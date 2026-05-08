-- Media tags. Tags are per-property, scoped to a single file (identified by
-- its R2 key). R2 stays the source of truth for whether a file exists; this
-- table only annotates them. If a file is deleted from R2 the orphan tag
-- rows are harmless and get cleaned up on next listing pass (could add a
-- background job later if needed).

create table public.media_tags (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  file_key text not null,
  tag text not null,
  created_at timestamptz not null default now(),
  unique (property_id, file_key, tag)
);

create index media_tags_property_idx on public.media_tags(property_id);
create index media_tags_file_key_idx on public.media_tags(property_id, file_key);

alter table public.media_tags enable row level security;

-- Org members read tags for their org's properties; platform admins read all.
create policy media_tags_select_org
  on public.media_tags for select
  using (
    public.is_platform_admin() or
    exists (
      select 1
      from public.properties p
      where p.id = media_tags.property_id
        and p.org_id = public.current_org_id()
    )
  );

-- Writes happen via service role (server actions); no INSERT/UPDATE/DELETE
-- policies needed for v1.
