-- Stream-hosted videos. R2 keeps still images; videos move to Cloudflare
-- Stream so we get edge-served thumbnails + adaptive playback without
-- client-side frame capture. Identifier here is the Stream UID; R2 stays
-- the source of truth for non-video files. media_metadata + media_tags
-- continue to apply to Stream rows via file_key = 'stream:' || stream_uid.

create table public.media_videos (
  property_id uuid not null references public.properties(id) on delete cascade,
  stream_uid text not null,
  filename text not null,
  size bigint not null default 0,
  duration_seconds int,
  status text not null default 'pending', -- pending | ready | error
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  primary key (property_id, stream_uid)
);

create index media_videos_property_idx on public.media_videos(property_id);
create index media_videos_status_idx on public.media_videos(status);

alter table public.media_videos enable row level security;

create policy media_videos_select_org
  on public.media_videos for select
  using (
    public.is_platform_admin() or
    exists (
      select 1
      from public.properties p
      where p.id = media_videos.property_id
        and p.org_id = public.current_org_id()
    )
  );

-- Writes go through service role from server actions — same pattern as
-- media_metadata / media_tags, no INSERT/UPDATE/DELETE policies for v1.
