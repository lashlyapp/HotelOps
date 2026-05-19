-- Revenue Intelligence — data pipeline foundation.
-- See docs/revenue-intelligence.md for the architecture overview.
--
-- This migration adds layers L0 (source registry), L1 (raw cleansed
-- observations, retained forever), L2 (normalized entity catalogs),
-- and the operational tables (data_source_runs).
--
-- Layer 3 (signals) and Layer 4 (recommendations + briefing) already
-- exist from 20260522000000_revenue_intelligence.sql; this migration
-- only adds the upstream ingestion side.
--
-- All L1/L2 data is platform-admin-only by RLS — these are not
-- per-org tables. Per-property signals derived from this data live
-- in the L3 tables which are RLS-scoped to org membership.

-- ---------------------------------------------------------------------------
-- L0 — data_source_registry
-- One row per data source. Drives the /admin/data-sources page and
-- gates every cron — a cron that finds `enabled = false` exits early
-- without making any API calls.
-- ---------------------------------------------------------------------------
create table public.data_source_registry (
  source                  text primary key,
  category                text not null,        -- 'events'|'weather'|'holidays'|'rates'|'reviews'|'search'|'venues'|'macro'|'disruption'
  display_name            text not null,
  description             text,
  api_key_env_var         text,                  -- env var that must be set for the adapter to run; null = no key required
  cron_schedule           text,                  -- the Vercel cron schedule string
  cron_path               text,                  -- '/api/cron/scrape-…' the registry row corresponds to
  required_for_signals    jsonb not null default '[]',
  enabled                 boolean not null default true,
  configured_at           timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  last_run_started_at     timestamptz,
  last_ok_at              timestamptz,
  last_error_at           timestamptz,
  last_error_message      text,
  observations_24h        integer not null default 0,
  observations_total      bigint not null default 0
);

alter table public.data_source_registry enable row level security;

create policy data_source_registry_select_admin
  on public.data_source_registry for select
  using (public.is_platform_admin());

comment on table public.data_source_registry is
  'Registry of every external data source the platform ingests. `enabled` controls whether the cron actually fetches. Default enabled per product requirement.';

-- ---------------------------------------------------------------------------
-- Operational — data_source_runs
-- One row per cron invocation. Surface in /admin/data-sources for
-- per-source health.
-- ---------------------------------------------------------------------------
create table public.data_source_runs (
  id                uuid primary key default gen_random_uuid(),
  source            text not null,
  trigger           text not null default 'cron',  -- 'cron'|'on_demand'|'admin'
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  status            text not null default 'running',  -- 'running'|'ok'|'error'|'partial'|'skipped'
  rows_ingested     integer not null default 0,
  api_calls         integer not null default 0,
  error_count       integer not null default 0,
  error_sample      text,
  context           jsonb not null default '{}'
);

create index data_source_runs_source_idx
  on public.data_source_runs(source, started_at desc);

create index data_source_runs_status_idx
  on public.data_source_runs(status, started_at desc);

alter table public.data_source_runs enable row level security;

create policy data_source_runs_select_admin
  on public.data_source_runs for select
  using (public.is_platform_admin());

comment on table public.data_source_runs is
  'One row per cron invocation. Drives per-source health in the admin pipeline page.';

-- ---------------------------------------------------------------------------
-- L1 — external_observations (RETAINED FOREVER per product requirement)
-- Every adapter writes here after cleansing. payload is normalized;
-- payload_raw preserves the original API response for audit / future
-- reprocessing.
-- ---------------------------------------------------------------------------
create table public.external_observations (
  id                uuid primary key default gen_random_uuid(),
  source            text not null,
  source_run_id     uuid references public.data_source_runs(id) on delete set null,
  observed_at       timestamptz not null,
  target_kind       text not null,             -- 'event'|'venue'|'holiday'|'weather'|'review'|'rate'|'pageview'|'fx'|'disruption'
  target_key        text,                       -- external id from the source ('ticketmaster:vvG1zZ9Fyg')
  geo_key           text,                       -- normalized 'city:charleston-sc-us'
  property_id       uuid references public.properties(id) on delete cascade,
  org_id            uuid references public.organizations(id) on delete cascade,
  payload           jsonb not null,             -- CLEANSED
  payload_raw       jsonb,                       -- ORIGINAL response (audit only)
  cleansed_at       timestamptz not null default now(),
  ingested_at       timestamptz not null default now()
);

create index external_observations_source_idx
  on public.external_observations(source, observed_at desc);
create index external_observations_kind_idx
  on public.external_observations(target_kind, target_key, observed_at desc);
create index external_observations_geo_idx
  on public.external_observations(geo_key, observed_at desc)
  where geo_key is not null;
create index external_observations_property_idx
  on public.external_observations(property_id, observed_at desc)
  where property_id is not null;

alter table public.external_observations enable row level security;

create policy external_observations_select_admin
  on public.external_observations for select
  using (public.is_platform_admin());

comment on table public.external_observations is
  'Raw + cleansed observations from every external source. Retained forever — feeds historical analysis. payload is post-cleansing; payload_raw preserves the original API response.';

-- ---------------------------------------------------------------------------
-- L2 — venues_catalog
-- Stable venue records used to anchor events geographically.
-- ---------------------------------------------------------------------------
create table public.venues_catalog (
  id              uuid primary key default gen_random_uuid(),
  external_source text,
  external_id     text,
  name            text not null,
  kind            text,                         -- 'arena'|'convention_center'|'theater'|'stadium'|'university'|'wedding_venue'|'other'
  capacity        integer,
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  city_key        text,                          -- 'city:charleston-sc-us'
  ingested_at     timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index venues_catalog_city_idx
  on public.venues_catalog(city_key);
create unique index venues_catalog_external_idx
  on public.venues_catalog(external_source, external_id)
  where external_source is not null and external_id is not null;

alter table public.venues_catalog enable row level security;

create policy venues_catalog_select_admin
  on public.venues_catalog for select
  using (public.is_platform_admin());

comment on table public.venues_catalog is
  'Normalized venue records. Events reference these; a single venue may host many events.';

-- ---------------------------------------------------------------------------
-- L2 — events_catalog
-- Deduplicated event records. Sources that publish the same event
-- (Ticketmaster + Eventbrite + Wikipedia) collapse to one row by
-- fuzzy-match on (geo_key, starts_at, name).
-- ---------------------------------------------------------------------------
create table public.events_catalog (
  id                  uuid primary key default gen_random_uuid(),
  external_source     text not null,
  external_id         text not null,
  name                text not null,
  category            text not null,            -- 'convention'|'concert'|'sports'|'festival'|'holiday'|'graduation'|'cruise'|'other'
  venue_id            uuid references public.venues_catalog(id) on delete set null,
  geo_key             text not null,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  expected_attendance integer,
  attendance_band     text,                      -- 'small'|'medium'|'large'|'mega'
  source_url          text,
  confidence          text not null default 'medium',  -- 'low'|'medium'|'high'
  ingested_at         timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (external_source, external_id)
);

create index events_catalog_geo_starts_idx
  on public.events_catalog(geo_key, starts_at);
create index events_catalog_starts_idx
  on public.events_catalog(starts_at);

alter table public.events_catalog enable row level security;

create policy events_catalog_select_admin
  on public.events_catalog for select
  using (public.is_platform_admin());

comment on table public.events_catalog is
  'Deduplicated, normalized event records from every event source. Feeds market_demand_signals via the signal builder.';

-- ---------------------------------------------------------------------------
-- L2 — holidays_catalog
-- ---------------------------------------------------------------------------
create table public.holidays_catalog (
  id              uuid primary key default gen_random_uuid(),
  country_code    text not null,                 -- ISO-3166 alpha-2, e.g. 'US'
  -- Subdivision (e.g. 'US-CA'). Empty string for country-wide
  -- holidays — empty rather than null so the unique constraint
  -- below can use plain column names (Postgres UNIQUE treats NULLs
  -- as distinct, which would let duplicate national holidays slip
  -- through).
  region_code     text not null default '',
  holiday_date    date not null,
  name            text not null,
  kind            text not null default 'public', -- 'public'|'school'|'religious'|'observance'
  source          text not null,
  ingested_at     timestamptz not null default now(),
  unique (country_code, region_code, holiday_date, name)
);

create index holidays_catalog_country_date_idx
  on public.holidays_catalog(country_code, holiday_date);

alter table public.holidays_catalog enable row level security;

create policy holidays_catalog_select_admin
  on public.holidays_catalog for select
  using (public.is_platform_admin());

comment on table public.holidays_catalog is
  'Normalized public + school + religious holidays. Sourced from Nager.Date and (later) per-locale calendars.';

-- ---------------------------------------------------------------------------
-- L2 — weather_observations
-- One row per (geo, source, forecast_date, observed_at). Multiple
-- forecast dates per observation reflect the source returning a
-- multi-day forecast.
-- ---------------------------------------------------------------------------
create table public.weather_observations (
  id              uuid primary key default gen_random_uuid(),
  geo_key         text not null,
  source          text not null,                 -- 'open_meteo'|'nws'
  observed_at     timestamptz not null,
  forecast_date   date not null,
  temp_high_c     numeric(4,1),
  temp_low_c      numeric(4,1),
  precip_mm       numeric(5,1),
  wind_kph_max    numeric(5,1),
  conditions      text,                           -- short code from source
  severe_alert    text,                           -- null if none
  ingested_at     timestamptz not null default now(),
  unique (geo_key, source, forecast_date, observed_at)
);

create index weather_observations_geo_date_idx
  on public.weather_observations(geo_key, forecast_date);

alter table public.weather_observations enable row level security;

create policy weather_observations_select_admin
  on public.weather_observations for select
  using (public.is_platform_admin());

comment on table public.weather_observations is
  'Per-geo per-source weather forecast observations. Multiple observations per day let us track forecast drift.';

-- ---------------------------------------------------------------------------
-- Seed the registry with the v1 source roster.
-- All rows enabled = true by default per product requirement.
-- ---------------------------------------------------------------------------
insert into public.data_source_registry
  (source, category, display_name, description, api_key_env_var, cron_schedule, cron_path, required_for_signals)
values
  ('nager_holidays',     'holidays', 'Nager.Date public holidays', 'Global public holidays per country / region.',                                  null,                       '0 3 * * 1',   '/api/cron/scrape-holidays',          '["market_demand_signals"]'::jsonb),
  ('open_meteo',         'weather',  'Open-Meteo forecast',         '14-day forecast per property geo. No API key required.',                       null,                       '0 */6 * * *', '/api/cron/scrape-weather',           '["market_demand_signals","weather_disruption_signals"]'::jsonb),
  ('wikipedia_events',   'events',   'Wikipedia recurring events',  'Annual festivals, recurring events scraped from Wikipedia "Events in" lists.', null,                       '0 4 * * 1',   '/api/cron/scrape-wikipedia-events',  '["market_demand_signals"]'::jsonb),
  ('ticketmaster',       'events',   'Ticketmaster Discovery',      'Concerts, sports, theater within 25km of each property.',                       'TICKETMASTER_API_KEY',     '0 */2 * * *', '/api/cron/scrape-ticketmaster',      '["market_demand_signals"]'::jsonb),
  ('eventbrite',         'events',   'Eventbrite local events',     'Independent local events per property city.',                                   'EVENTBRITE_API_TOKEN',     '0 */6 * * *', '/api/cron/scrape-eventbrite',        '["market_demand_signals"]'::jsonb),
  ('exchange_rate_host', 'macro',    'exchangerate.host FX',        'Daily FX snapshot, used for inbound-market currency context.',                  null,                       '0 9 * * *',   '/api/cron/scrape-fx',                '["search_intent_signals"]'::jsonb),
  ('booking_affiliate',  'rates',    'Booking.com Affiliate',       'Competitor rates + availability via Booking.com Affiliate Partner API.',        'BOOKING_AFFILIATE_KEY',    '0 4,16 * * *','/api/cron/scrape-competitor-rates',  '["pricing_recommendations"]'::jsonb),
  ('expedia_rapid',      'rates',    'Expedia Rapid (EAN)',         'Competitor rates + availability via Expedia Rapid API.',                        'EXPEDIA_RAPID_KEY',        '0 4,16 * * *','/api/cron/scrape-competitor-rates',  '["pricing_recommendations"]'::jsonb),
  ('hotelbeds',          'rates',    'Hotelbeds bedbank',           'Independent boutique coverage via Hotelbeds.',                                  'HOTELBEDS_API_KEY',        '0 4,16 * * *','/api/cron/scrape-competitor-rates',  '["pricing_recommendations"]'::jsonb),
  ('google_maps_reviews','reviews',  'Google Maps reviews',         'Property + competitor review streams. Scraped cautiously.',                     null,                       '0 7 * * *',   '/api/cron/scrape-reviews',           '["review_sentiment_signals"]'::jsonb),
  ('google_trends',      'search',   'Google Trends',               'Destination demand index via unofficial pytrends-style scrape.',                null,                       '30 8 * * *',  '/api/cron/scrape-search-trends',     '["search_intent_signals"]'::jsonb),
  ('wikipedia_pageviews','search',   'Wikipedia pageviews',         'Per-city pageview trend, free official API.',                                   null,                       '0 8 * * *',   '/api/cron/scrape-pageviews',         '["search_intent_signals"]'::jsonb),
  ('overpass_venues',    'venues',   'OpenStreetMap venues',        'Nearby venues, arenas, universities via Overpass API.',                         null,                       '0 2 * * 0',   '/api/cron/refresh-venues',           '[]'::jsonb),
  ('nws_alerts',         'disruption','NWS severe weather alerts',  'US National Weather Service active alerts. Free, no key.',                       null,                       '0 */3 * * *', '/api/cron/scrape-nws-alerts',        '["weather_disruption_signals"]'::jsonb),
  ('airnow_aqi',         'disruption','AirNow AQI',                 'US air quality / wildfire smoke. Free with key.',                                'AIRNOW_API_KEY',           '0 */6 * * *', '/api/cron/scrape-aqi',               '["weather_disruption_signals"]'::jsonb);
