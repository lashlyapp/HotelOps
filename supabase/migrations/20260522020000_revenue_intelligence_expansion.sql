-- Revenue Intelligence — pipeline expansion (PR3).
-- Adds L2 entity tables + L3 signal tables for the new sources:
--   • NWS severe weather alerts  → disruption_observations → weather_disruption_signals
--   • Wikipedia pageviews        → search_demand_observations → search_intent_signals
--   • exchange-rate.host         → fx_observations
--   • OpenStreetMap Overpass     → venues_catalog (table already exists)
--   • TripAdvisor (customer-provided URL, scrape) → review_observations → review_sentiment_signals
--   • Ticketmaster + Eventbrite  → events_catalog (table already exists)
--
-- Also seeds the registry with the Yelp Fusion row (the rest were
-- seeded in 20260522010000).
--
-- L1 (external_observations) is shared across every source — no new
-- L1 tables needed.

-- ---------------------------------------------------------------------------
-- L2 — disruption_observations (NWS severe weather, AQI, port closures, …)
-- ---------------------------------------------------------------------------
create table public.disruption_observations (
  id              uuid primary key default gen_random_uuid(),
  source          text not null,                  -- 'nws_alerts'|'airnow_aqi'|'noaa_hurricane'|'faa_delay'
  external_id     text,                            -- source-issued id (e.g. NWS alert id)
  geo_key         text not null,                   -- 'city:charleston-sc-us' or 'state:US-SC'
  kind            text not null,                   -- 'storm'|'wildfire_smoke'|'air_quality'|'earthquake'|'airport_delay'|'closure'
  severity        text not null default 'medium',  -- 'low'|'medium'|'high'|'extreme'
  observed_at     timestamptz not null,
  effective_at    timestamptz,
  ends_at         timestamptz,
  headline        text not null,
  description     text,
  ingested_at     timestamptz not null default now(),
  unique (source, external_id)
);

create index disruption_observations_geo_idx
  on public.disruption_observations(geo_key, effective_at);

alter table public.disruption_observations enable row level security;

create policy disruption_observations_select_admin
  on public.disruption_observations for select
  using (public.is_platform_admin());

comment on table public.disruption_observations is
  'Active and forecast disruptions affecting hotel demand: severe weather, air quality, airport delays, port closures.';

-- ---------------------------------------------------------------------------
-- L2 — search_demand_observations
-- One row per (geo, query, source, observed_at). Pageviews are the
-- per-day count for the destination's Wikipedia article. Google Trends
-- (later) writes here too with a 0-100 normalized score.
-- ---------------------------------------------------------------------------
create table public.search_demand_observations (
  id              uuid primary key default gen_random_uuid(),
  geo_key         text not null,
  query           text not null,                   -- 'wikipedia:Charleston%2C_South_Carolina' or 'trend:hotels in charleston'
  source          text not null,                   -- 'wikipedia_pageviews'|'google_trends'
  observed_at     timestamptz not null,
  measurement_date date not null,                  -- the day the measurement covers (yesterday for pageviews)
  score           numeric(10,2) not null,          -- raw pageviews OR 0-100 normalized trend score
  source_market   text,                             -- 'us'|'gb'|null
  ingested_at     timestamptz not null default now(),
  unique (geo_key, query, source, source_market, measurement_date)
);

create index search_demand_observations_geo_date_idx
  on public.search_demand_observations(geo_key, measurement_date desc);

alter table public.search_demand_observations enable row level security;

create policy search_demand_observations_select_admin
  on public.search_demand_observations for select
  using (public.is_platform_admin());

comment on table public.search_demand_observations is
  'Per-destination search demand observations: Wikipedia pageviews, Google Trends scores.';

-- ---------------------------------------------------------------------------
-- L2 — fx_observations
-- ---------------------------------------------------------------------------
create table public.fx_observations (
  base_currency   text not null,
  observed_at     timestamptz not null,
  rates           jsonb not null,                   -- { 'eur': 0.92, 'gbp': 0.79, ... }
  source          text not null default 'exchange_rate_host',
  ingested_at     timestamptz not null default now(),
  primary key (base_currency, observed_at)
);

alter table public.fx_observations enable row level security;

create policy fx_observations_select_admin
  on public.fx_observations for select
  using (public.is_platform_admin());

comment on table public.fx_observations is
  'Daily FX snapshots. Drives inbound-market currency context in the briefing ("USD strong vs EUR — European inbound likely to soften").';

-- ---------------------------------------------------------------------------
-- L2 — review_observations
-- One row per individual review pulled from Yelp / (later) TripAdvisor.
-- target_kind = 'property' for the customer's own hotel, 'competitor'
-- for a comp-set member. target_id resolves to either properties.id
-- or competitor_properties.id (loosely typed; the signal builder
-- knows which to look in).
-- ---------------------------------------------------------------------------
create table public.review_observations (
  id              uuid primary key default gen_random_uuid(),
  target_kind     text not null,                   -- 'property'|'competitor'
  target_id       uuid not null,
  source          text not null,                   -- 'yelp_fusion'|'tripadvisor'|'google_places'
  external_id     text not null,                   -- source-issued review id
  posted_at       timestamptz,
  rating          numeric(2,1),                    -- 1.0 - 5.0
  text            text,                             -- truncated to 8KB by cleansing
  language        text,
  sentiment_score numeric(3,2),                    -- -1.0 to 1.0 (lexicon-based, computed locally)
  reviewer_hash   text,                             -- HMAC of reviewer name, NOT raw
  ingested_at     timestamptz not null default now(),
  unique (source, external_id)
);

create index review_observations_target_idx
  on public.review_observations(target_kind, target_id, posted_at desc);

alter table public.review_observations enable row level security;

create policy review_observations_select_admin
  on public.review_observations for select
  using (public.is_platform_admin());

comment on table public.review_observations is
  'Individual review records pulled from Yelp + later TripAdvisor. Reviewer names are HMAC-hashed for k-anonymity.';

-- ---------------------------------------------------------------------------
-- L3 — review_sentiment_signals (per property)
-- Builds rolling 30-day windows of review sentiment for the property
-- and for the comp set average. Drives the "Review intelligence"
-- card on /market and the review-deterioration recommendation rule.
-- ---------------------------------------------------------------------------
create table public.review_sentiment_signals (
  id                    uuid primary key default gen_random_uuid(),
  property_id           uuid not null references public.properties(id) on delete cascade,
  org_id                uuid not null references public.organizations(id) on delete cascade,
  observed_at           timestamptz not null,
  window_days           integer not null default 30,
  rating_avg            numeric(2,1),
  rating_delta_vs_prev  numeric(3,2),               -- signed delta vs the previous window
  review_count_window   integer not null default 0,
  sentiment_avg         numeric(3,2),
  top_complaint_theme   text,
  top_praise_theme      text,
  competitor_avg        numeric(2,1),
  vs_competitor_delta   numeric(3,2),               -- property avg - competitor avg
  unique (property_id, observed_at, window_days)
);

create index review_sentiment_signals_property_idx
  on public.review_sentiment_signals(property_id, observed_at desc);

alter table public.review_sentiment_signals enable row level security;

create policy review_sentiment_signals_select_org
  on public.review_sentiment_signals for select
  using (
    public.is_platform_admin() or
    exists (
      select 1 from public.properties p
      where p.id = review_sentiment_signals.property_id
        and p.org_id = public.current_org_id()
    )
  );

comment on table public.review_sentiment_signals is
  'Per-property rolling review sentiment + comp set comparison. Powers the "Review intelligence" card on /market.';

-- ---------------------------------------------------------------------------
-- L3 — search_intent_signals (per property)
-- ---------------------------------------------------------------------------
create table public.search_intent_signals (
  id                       uuid primary key default gen_random_uuid(),
  property_id              uuid not null references public.properties(id) on delete cascade,
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  observed_at              timestamptz not null,
  destination_demand_score numeric(6,2),            -- normalized 0-100 from pageviews / trends
  wow_change_pct           numeric(6,2),            -- week-over-week % change
  yoy_change_pct           numeric(6,2),
  pageview_avg_7d          numeric(10,2),
  pageview_avg_28d         numeric(10,2),
  trending_up              boolean not null default false,
  unique (property_id, observed_at)
);

create index search_intent_signals_property_idx
  on public.search_intent_signals(property_id, observed_at desc);

alter table public.search_intent_signals enable row level security;

create policy search_intent_signals_select_org
  on public.search_intent_signals for select
  using (
    public.is_platform_admin() or
    exists (
      select 1 from public.properties p
      where p.id = search_intent_signals.property_id
        and p.org_id = public.current_org_id()
    )
  );

comment on table public.search_intent_signals is
  'Per-property destination demand index from Wikipedia pageviews + (later) Google Trends. Leading indicator of booking demand 2-6 weeks out.';

-- ---------------------------------------------------------------------------
-- L3 — weather_disruption_signals (per property)
-- ---------------------------------------------------------------------------
create table public.weather_disruption_signals (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  signal_date     date not null,
  kind            text not null,                   -- 'storm'|'heatwave'|'cold_snap'|'wildfire_smoke'|'airport_delay'
  intensity       integer not null default 3,      -- 1-5
  headline        text not null,
  effective_at    timestamptz,
  ends_at         timestamptz,
  source          text not null,
  source_external_id text,
  unique (property_id, signal_date, kind, source)
);

create index weather_disruption_signals_property_idx
  on public.weather_disruption_signals(property_id, signal_date);

alter table public.weather_disruption_signals enable row level security;

create policy weather_disruption_signals_select_org
  on public.weather_disruption_signals for select
  using (
    public.is_platform_admin() or
    exists (
      select 1 from public.properties p
      where p.id = weather_disruption_signals.property_id
        and p.org_id = public.current_org_id()
    )
  );

comment on table public.weather_disruption_signals is
  'Per-property weather + disruption signals derived from disruption_observations + weather_observations.';

-- ---------------------------------------------------------------------------
-- Per-property identifiers for external review sources.
-- TripAdvisor URL is customer-provided on /market/settings — scraping
-- only happens for properties whose operator has explicitly supplied
-- the URL (clean consent posture, no auto-discovery).
-- ---------------------------------------------------------------------------
alter table public.property_market_profile
  add column if not exists tripadvisor_url text,
  add column if not exists google_place_id text;

comment on column public.property_market_profile.tripadvisor_url is
  'Customer-provided TripAdvisor URL. Scraping the property review page is gated on this being set.';
comment on column public.property_market_profile.google_place_id is
  'Customer-provided Google Maps Place ID. Reserved for future Google reviews integration.';

-- ---------------------------------------------------------------------------
-- Drop the placeholder Yelp Fusion row from the registry (if it was
-- already seeded in a prior environment) and replace with TripAdvisor.
-- Yelp coverage of hotels is too sparse to be useful; TripAdvisor is
-- the hospitality review standard.
-- ---------------------------------------------------------------------------
delete from public.data_source_registry where source = 'yelp_fusion';

insert into public.data_source_registry
  (source, category, display_name, description, api_key_env_var, cron_schedule, cron_path, required_for_signals)
values
  ('tripadvisor', 'reviews', 'TripAdvisor (customer-URL scrape)',
   'Scrapes the TripAdvisor page for each property whose operator provided a URL on /market/settings. No API key, no approval; respects rate limits.',
   null, '0 7 * * *', '/api/cron/scrape-tripadvisor',
   '["review_sentiment_signals"]'::jsonb)
on conflict (source) do update
  set api_key_env_var = excluded.api_key_env_var,
      cron_schedule = excluded.cron_schedule,
      cron_path = excluded.cron_path,
      description = excluded.description,
      updated_at = now();
