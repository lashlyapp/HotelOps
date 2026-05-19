-- Revenue Intelligence — competitive rates + peer benchmark + daily digest.
-- Builds on 20260522010000 (pipeline foundation) and 20260522020000
-- (review intelligence + search/disruption).
--
-- New surface in this migration:
--
--   • competitor_rate_snapshots — per (competitor, scrape_date,
--     target_date) rates from the OTA affiliate adapters (Booking,
--     Expedia, Hotelbeds). 24-hour TTL enforced via expires_at so
--     we honour the affiliate caching contracts.
--
--   • property_rate_parity_snapshots — per-property gap between the
--     property's own listed rate and comp-set median. Drives the
--     parity_alert recommendation rule.
--
--   • peer_adr_observations — anonymized ADR floor/ceiling per
--     reporting org. Reader queries enforce k-anonymity (≥3 reporting
--     orgs per cohort) at the signal-builder layer. The table itself
--     stores HMAC-hashed org ids; no readable mapping back to the
--     contributing tenant.
--
--   • peer_benchmark_signals — per-property benchmark window
--     derived from peer_adr_observations.
--
--   • organizations.peer_adr_opt_in — soft consent flag; opt-in via
--     /market/settings. When false the org consumes peer data but
--     does not contribute.
--
--   • organizations.market_briefing_email_opt_out — soft opt-out
--     for the daily email digest. Defaults to false (everyone gets
--     it).
--
--   • briefing_email_log — dedupe table for the daily digest
--     cron. One row per (property, briefing_date) so a cron retry
--     in the same morning doesn't double-send.
--
--   • Registry rows for booking_affiliate / expedia_rapid /
--     hotelbeds (these existed as registry rows from earlier
--     migrations; this migration updates their cron_path /
--     descriptions and adds peer_benchmark + email cron rows).

-- ---------------------------------------------------------------------------
-- L2 — competitor_rate_snapshots
-- ---------------------------------------------------------------------------
create table public.competitor_rate_snapshots (
  id                uuid primary key default gen_random_uuid(),
  competitor_id     uuid not null references public.property_competitor_set(id) on delete cascade,
  property_id       uuid not null references public.properties(id) on delete cascade,
  source            text not null,                  -- 'booking_affiliate'|'expedia_rapid'|'hotelbeds'
  scrape_date       date not null,
  target_date       date not null,
  currency          text not null,
  rate_min          numeric(10,2),
  rate_max          numeric(10,2),
  availability      text,                            -- 'available'|'limited'|'sold_out'|'unknown'
  rooms_left_hint   integer,
  fetched_at        timestamptz not null default now(),
  expires_at        timestamptz not null,            -- enforced 24h TTL for affiliate caching contracts
  unique (competitor_id, source, scrape_date, target_date)
);

create index competitor_rate_snapshots_property_target_idx
  on public.competitor_rate_snapshots(property_id, target_date, scrape_date desc);
create index competitor_rate_snapshots_expires_idx
  on public.competitor_rate_snapshots(expires_at);

alter table public.competitor_rate_snapshots enable row level security;

create policy competitor_rate_snapshots_select_admin
  on public.competitor_rate_snapshots for select
  using (public.is_platform_admin());

comment on table public.competitor_rate_snapshots is
  'Per-competitor per-target-date rate observations from OTA affiliate adapters. 24h TTL respects affiliate caching contracts; signal builders read fresh + un-expired only.';

-- ---------------------------------------------------------------------------
-- L3 — property_rate_parity_snapshots
-- One snapshot per (property, channel, scrape_date, target_date).
-- Channel = 'comp_set_median' for the synthetic "us vs comparable"
-- gap; later channels = 'booking_com', 'expedia' once we monitor the
-- property's own OTA listings.
-- ---------------------------------------------------------------------------
create table public.property_rate_parity_snapshots (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  channel         text not null,                    -- 'comp_set_median'|'booking_com'|'expedia'
  scrape_date     date not null,
  target_date     date not null,
  our_rate        numeric(10,2),
  channel_rate   numeric(10,2),
  gap_pct        numeric(5,2),
  source_count   integer not null default 0,
  fetched_at     timestamptz not null default now(),
  unique (property_id, channel, scrape_date, target_date)
);

create index property_rate_parity_snapshots_property_idx
  on public.property_rate_parity_snapshots(property_id, target_date);

alter table public.property_rate_parity_snapshots enable row level security;

create policy property_rate_parity_snapshots_select_org
  on public.property_rate_parity_snapshots for select
  using (
    public.is_platform_admin() or
    exists (
      select 1 from public.properties p
      where p.id = property_rate_parity_snapshots.property_id
        and p.org_id = public.current_org_id()
    )
  );

comment on table public.property_rate_parity_snapshots is
  'Per-property per-target-date parity gap vs a channel (comp set median, Booking direct, etc.). Drives the parity_alert recommendation rule.';

-- ---------------------------------------------------------------------------
-- Peer ADR pool (opt-in, k-anonymized)
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists peer_adr_opt_in boolean not null default false;

comment on column public.organizations.peer_adr_opt_in is
  'Soft consent for contributing anonymized ADR band to the city-level peer benchmark pool. Defaults false; opted in on /market/settings. Non-contributors still consume peer data.';

create table public.peer_adr_observations (
  id                  uuid primary key default gen_random_uuid(),
  city_key            text not null,
  market_segment      text not null,
  tier                integer not null,
  reporting_org_hash  text not null,                 -- HMAC(org_id, PEER_HASH_SALT); no reverse lookup
  observed_at         timestamptz not null,
  adr_floor           numeric(10,2),
  adr_ceiling         numeric(10,2),
  currency            text not null,
  unique (reporting_org_hash, city_key, market_segment, observed_at)
);

create index peer_adr_observations_cohort_idx
  on public.peer_adr_observations(city_key, market_segment, tier, observed_at desc);

alter table public.peer_adr_observations enable row level security;

create policy peer_adr_observations_select_admin
  on public.peer_adr_observations for select
  using (public.is_platform_admin());

comment on table public.peer_adr_observations is
  'Anonymized ADR contributions from opted-in orgs. Reader queries enforce k-anonymity (≥3 distinct reporting_org_hash per cohort) at the signal-builder layer. No raw org_id is ever stored here.';

-- ---------------------------------------------------------------------------
-- L3 — peer_benchmark_signals
-- ---------------------------------------------------------------------------
create table public.peer_benchmark_signals (
  id                  uuid primary key default gen_random_uuid(),
  property_id         uuid not null references public.properties(id) on delete cascade,
  org_id              uuid not null references public.organizations(id) on delete cascade,
  observed_at         timestamptz not null,
  city_key            text not null,
  market_segment      text not null,
  cohort_size         integer not null,
  peer_adr_p25        numeric(10,2),
  peer_adr_median     numeric(10,2),
  peer_adr_p75        numeric(10,2),
  property_position   text not null,                  -- 'below_p25'|'p25_p50'|'p50_p75'|'above_p75'|'unknown'
  unique (property_id, observed_at)
);

create index peer_benchmark_signals_property_idx
  on public.peer_benchmark_signals(property_id, observed_at desc);

alter table public.peer_benchmark_signals enable row level security;

create policy peer_benchmark_signals_select_org
  on public.peer_benchmark_signals for select
  using (
    public.is_platform_admin() or
    exists (
      select 1 from public.properties p
      where p.id = peer_benchmark_signals.property_id
        and p.org_id = public.current_org_id()
    )
  );

comment on table public.peer_benchmark_signals is
  'Per-property city-cohort ADR benchmark. cohort_size < 3 means k-anonymity violated; row is not created in that case.';

-- ---------------------------------------------------------------------------
-- Daily email digest plumbing
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists market_briefing_email_opt_out boolean not null default false;

comment on column public.organizations.market_briefing_email_opt_out is
  'Soft opt-out for the daily market briefing email. Defaults false — all owners get the digest unless they opt out.';

create table public.briefing_email_log (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  briefing_date   date not null,
  sent_at         timestamptz not null default now(),
  recipient_email text not null,
  resend_id       text,
  unique (property_id, briefing_date)
);

create index briefing_email_log_org_idx
  on public.briefing_email_log(org_id, briefing_date desc);

alter table public.briefing_email_log enable row level security;

create policy briefing_email_log_select_admin
  on public.briefing_email_log for select
  using (public.is_platform_admin());

comment on table public.briefing_email_log is
  'Dedupe for the daily briefing cron. Unique on (property, date) so retries within the same morning never double-send.';

-- ---------------------------------------------------------------------------
-- Update / add registry rows for OTA rate sources + new builder crons.
-- (booking_affiliate / expedia_rapid / hotelbeds rows were seeded
-- in 20260522010000; this migration updates them to point at the
-- right cron path and description now that the adapters exist.)
-- ---------------------------------------------------------------------------
update public.data_source_registry
  set cron_path = '/api/cron/scrape-booking-rates',
      description = 'Competitor rates + availability via Booking.com Affiliate Partner API. 24h cache TTL enforced.',
      cron_schedule = '0 4,16 * * *',
      updated_at = now()
  where source = 'booking_affiliate';

update public.data_source_registry
  set cron_path = '/api/cron/scrape-expedia-rates',
      description = 'Competitor rates + availability via Expedia Rapid (EAN) API. 24h cache TTL enforced.',
      cron_schedule = '30 4,16 * * *',
      updated_at = now()
  where source = 'expedia_rapid';

update public.data_source_registry
  set cron_path = '/api/cron/scrape-hotelbeds-rates',
      description = 'Independent boutique coverage via Hotelbeds bedbank API.',
      cron_schedule = '0 5,17 * * *',
      updated_at = now()
  where source = 'hotelbeds';
