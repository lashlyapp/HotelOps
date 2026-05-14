-- Digital signage v1: per-property screens, playlists, playlist items, schedules.
-- Spec: docs/signage-spec.md
--
-- Pricing axis is per-property (not per-screen) — operators register as many
-- screens as they want and the player runs from any web browser via the
-- /display/<token> route. Token is opaque, single-use rotatable on unpair.

create type public.signage_item_kind as enum ('image', 'video', 'web', 'text');

create table public.signage_screens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 80),
  -- Embedded in /display/<player_token>. Rotated by "unpair".
  player_token text not null unique,
  -- 6-digit pairing code, valid 10 minutes. Cleared on bind.
  pairing_code text unique,
  pairing_code_expires_at timestamptz,
  last_heartbeat_at timestamptz,
  last_user_agent text,
  current_item_id uuid,
  -- Per-screen emergency override. emergency_until > now() means the player
  -- shows the message instead of the scheduled playlist.
  emergency_message text,
  emergency_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index signage_screens_org_idx on public.signage_screens(org_id);
create index signage_screens_property_idx on public.signage_screens(property_id);
create unique index signage_screens_pairing_code_idx
  on public.signage_screens(pairing_code) where pairing_code is not null;

create table public.signage_playlists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  -- One default per property — what plays when no schedule matches.
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index signage_playlists_property_idx on public.signage_playlists(property_id);
create unique index signage_playlists_default_per_property
  on public.signage_playlists(property_id) where is_default;

create table public.signage_playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.signage_playlists(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind public.signage_item_kind not null,
  -- For image/video: { r2_key, poster_key? }. For web: { url }. For text:
  -- { heading, subheading, background, color }. Validated at the write site
  -- (server actions) so the player can trust the shape.
  payload jsonb not null default '{}',
  duration_seconds integer not null default 8
    check (duration_seconds between 2 and 600),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index signage_playlist_items_playlist_idx
  on public.signage_playlist_items(playlist_id, sort_order);

create table public.signage_schedules (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid not null references public.signage_screens(id) on delete cascade,
  playlist_id uuid not null references public.signage_playlists(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  starts_on date,
  ends_on date,
  -- 'HH:MM' strings, property local time. Both null = whole day.
  start_time text,
  end_time text,
  -- Higher priority wins overlap. Default playlist applies at priority -1.
  priority integer not null default 0,
  created_at timestamptz not null default now()
);

create index signage_schedules_screen_idx on public.signage_schedules(screen_id);

-- ----------------------------------------------------------------------------
-- RLS: standard org-scoped read; writes via service role.
-- ----------------------------------------------------------------------------
alter table public.signage_screens enable row level security;
alter table public.signage_playlists enable row level security;
alter table public.signage_playlist_items enable row level security;
alter table public.signage_schedules enable row level security;

create policy signage_screens_select_org on public.signage_screens for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy signage_playlists_select_org on public.signage_playlists for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy signage_playlist_items_select_org
  on public.signage_playlist_items for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

create policy signage_schedules_select_org on public.signage_schedules for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
