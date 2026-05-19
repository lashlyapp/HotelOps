-- Revenue Intelligence — flagship "AI commercial copilot" surface.
-- Strategically positions MyHotelOps against Lighthouse for the boutique
-- independent market: no comp-set configuration, no analyst dashboards,
-- no enterprise BI. The platform infers what the property is, who it
-- competes with, and surfaces a daily executive briefing.
--
-- This migration defines the *persistence* layer only. The intelligence
-- itself is heuristic-driven (see src/lib/market/*) and seeded
-- deterministically per (property_id, date) so the experience feels
-- automatic from the first visit — no real OTA / events feeds are
-- required to ship v1.
--
-- Five tables, all per-property:
--
--   property_market_profile  — auto-detected tier, segment, ADR band,
--                              location vector. One row per property,
--                              upserted on first /market visit.
--
--   property_competitor_set  — comparable properties the platform
--                              identified. We do NOT show real
--                              names from third-party APIs in v1;
--                              names are deterministically generated
--                              from the property's market profile so
--                              the UX is concrete without the legal
--                              and contract overhead of OTA scraping.
--
--   market_demand_signals    — surfaced demand events (conventions,
--                              concerts, festivals, holidays). One
--                              row per (property, signal_date,
--                              signal_key) — keyed so a retry never
--                              double-inserts.
--
--   pricing_recommendations  — daily concise "consider raising
--                              Friday by $24" cards. One row per
--                              (property, recommendation_date,
--                              recommendation_key).
--
--   daily_market_briefings   — the executive AI-summary card the
--                              GM sees at the top of /market every
--                              morning. One row per (property, briefing_date).

-- ---------------------------------------------------------------------------
-- 1. Auto-detected market profile
-- ---------------------------------------------------------------------------
-- Filled in by src/lib/market/profile.ts on first visit. The GM can
-- override any field via /market/settings — overrides are stored on
-- the same row (no separate "user overrides" table) and the
-- regeneration logic respects them.
create table public.property_market_profile (
  property_id uuid primary key references public.properties(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- 'economy' | 'midscale' | 'upscale' | 'luxury' | 'lifestyle' | 'boutique'.
  -- Stored as text rather than enum so we can add segments without a
  -- migration. Default 'boutique' matches the platform's target market.
  market_segment text not null default 'boutique',
  -- 1-5. Drives competitor matching: a 4-star property compares
  -- against 3-5-star peers, not against economy.
  tier integer not null default 4,
  -- Inclusive ADR band in the property's org currency. The
  -- recommendation engine compares the property's current rates
  -- against this band to flag underpricing.
  adr_floor numeric(10,2),
  adr_ceiling numeric(10,2),
  -- Free-form neighborhood / location descriptor used in briefing
  -- copy ("Downtown waterfront", "Historic district").
  location_descriptor text,
  -- Comma-separated amenity tags ("rooftop_bar,spa,pool"). Drives
  -- which competitor archetypes we generate names from.
  amenity_tags text,
  -- True once the GM has visited /market/settings and explicitly
  -- saved. While false, every nightly refresh is free to re-derive
  -- the whole row from property data. Once true, we treat the row
  -- as ground truth and only refill empty fields.
  operator_confirmed boolean not null default false,
  detected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index property_market_profile_org_idx
  on public.property_market_profile(org_id);

alter table public.property_market_profile enable row level security;

create policy property_market_profile_select_org
  on public.property_market_profile for select
  using (
    public.is_platform_admin() or
    exists (
      select 1
      from public.properties p
      where p.id = property_market_profile.property_id
        and p.org_id = public.current_org_id()
    )
  );

comment on table public.property_market_profile is
  'Auto-detected positioning per property — segment, tier, ADR band, location. Drives competitor selection and recommendation thresholds. GM-editable via /market/settings; operator_confirmed gates re-detection.';

-- ---------------------------------------------------------------------------
-- 2. Detected competitor set
-- ---------------------------------------------------------------------------
-- v1 stores deterministic synthetic competitor archetypes so the UX is
-- concrete without real OTA contracts. The shape is deliberately
-- forward-compatible with a future "real comp set from Booking.com /
-- Expedia" backfill — `external_source` + `external_id` are reserved.
create table public.property_competitor_set (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- Display name shown in the competitor card. v1 is heuristic.
  competitor_name text not null,
  -- 'similar_boutique' | 'lifestyle_peer' | 'upscale_chain' | 'independent_peer'.
  archetype text not null,
  -- Self-reported distance from the property in km. Heuristic in v1.
  distance_km numeric(6,2),
  -- Inclusive ADR band the system believes the competitor is operating in.
  adr_floor numeric(10,2),
  adr_ceiling numeric(10,2),
  -- 0-100 score for how comparable this competitor is. Drives ordering.
  match_score integer not null default 75,
  external_source text,
  external_id text,
  created_at timestamptz not null default now(),
  unique (property_id, competitor_name)
);

create index property_competitor_set_property_idx
  on public.property_competitor_set(property_id, match_score desc);

alter table public.property_competitor_set enable row level security;

create policy property_competitor_set_select_org
  on public.property_competitor_set for select
  using (
    public.is_platform_admin() or
    exists (
      select 1
      from public.properties p
      where p.id = property_competitor_set.property_id
        and p.org_id = public.current_org_id()
    )
  );

comment on table public.property_competitor_set is
  'Auto-detected comparable properties. v1 is heuristic (no OTA contracts); external_source/external_id reserved for real-comp-set backfill.';

-- ---------------------------------------------------------------------------
-- 3. Demand signals (events, conventions, concerts, holidays)
-- ---------------------------------------------------------------------------
create table public.market_demand_signals (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- The date the signal *affects*. A weekend concert generates one
  -- row for the Saturday it falls on, not for "today". Drives the
  -- forward-looking demand timeline in /market.
  signal_date date not null,
  -- Stable key used for upsert. Lets the nightly refresher re-derive
  -- without duplicating ("convention:downtown-tech-summit:2026-06-12").
  signal_key text not null,
  -- 'convention' | 'concert' | 'sports' | 'festival' | 'holiday' | 'seasonal' | 'compression'.
  signal_type text not null,
  -- The human-readable summary. Short, executive-style. ("Large
  -- downtown tech convention; expect compressed mid-week occupancy.")
  headline text not null,
  -- 1-5. The recommendation engine uses this to size pricing nudges.
  intensity integer not null default 3,
  -- 'low' | 'medium' | 'high'. The system's confidence in the signal.
  -- Heuristic-derived signals in v1 are mostly 'medium'.
  confidence text not null default 'medium',
  -- Free-form context shown when the GM taps the card.
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (property_id, signal_date, signal_key)
);

create index market_demand_signals_property_idx
  on public.market_demand_signals(property_id, signal_date);

alter table public.market_demand_signals enable row level security;

create policy market_demand_signals_select_org
  on public.market_demand_signals for select
  using (
    public.is_platform_admin() or
    exists (
      select 1
      from public.properties p
      where p.id = market_demand_signals.property_id
        and p.org_id = public.current_org_id()
    )
  );

comment on table public.market_demand_signals is
  'Forward-looking demand events that affect this property''s market. Conventions, concerts, sports, festivals, holidays. v1: heuristic-derived. v2: external feeds.';

-- ---------------------------------------------------------------------------
-- 4. Pricing recommendations
-- ---------------------------------------------------------------------------
create table public.pricing_recommendations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- The day the rate change should apply to. Not the day the
  -- recommendation was generated.
  target_date date not null,
  -- Stable key used for upsert ("weekend_lift:2026-05-23").
  recommendation_key text not null,
  -- 'rate_increase' | 'rate_hold' | 'rate_decrease' | 'parity_alert' | 'visibility_gap'.
  recommendation_type text not null,
  -- The headline shown on the opportunity card. One sentence,
  -- confident, non-technical. ("Friday Deluxe King is pricing $24
  -- below comparable downtown boutiques.")
  headline text not null,
  -- The "why" — one or two short sentences. The recommendation
  -- engine composes this from the contributing signals so the GM
  -- can sanity-check the suggestion.
  rationale text,
  -- Suggested delta in the org's currency. NULL for non-rate
  -- recommendations (parity / visibility alerts).
  suggested_delta numeric(10,2),
  -- 1-5. Drives the card's visual prominence and the "high priority"
  -- count in the daily briefing.
  priority integer not null default 3,
  confidence text not null default 'medium',
  -- The signals that contributed: ["demand_signal:<uuid>",
  -- "competitor_set:<uuid>"]. Lets the UX show "based on:
  -- convention X, comparable rate Y".
  contributing_signals jsonb not null default '[]'::jsonb,
  -- Stamped when the GM clicks "Mark as acted on". Purely
  -- informational; drives an "adoption" KPI for the admin dashboard
  -- and removes the card from the active opportunity list.
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (property_id, target_date, recommendation_key)
);

create index pricing_recommendations_property_active_idx
  on public.pricing_recommendations(property_id, acted_at, target_date);

alter table public.pricing_recommendations enable row level security;

create policy pricing_recommendations_select_org
  on public.pricing_recommendations for select
  using (
    public.is_platform_admin() or
    exists (
      select 1
      from public.properties p
      where p.id = pricing_recommendations.property_id
        and p.org_id = public.current_org_id()
    )
  );

comment on table public.pricing_recommendations is
  'Daily pricing opportunity cards. One row per (property, target_date, recommendation_key); the unique constraint lets the refresher re-derive without duplicating.';

-- ---------------------------------------------------------------------------
-- 5. Daily executive briefing
-- ---------------------------------------------------------------------------
create table public.daily_market_briefings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- The date the briefing summarizes. The cron upserts on
  -- (property_id, briefing_date).
  briefing_date date not null,
  -- The top-line one-sentence "what should I pay attention to today".
  -- This is the only text the GM sees if they open the app and close
  -- it 5 seconds later — it must stand alone.
  headline text not null,
  -- 2-4 short paragraphs covering occupancy outlook, demand changes,
  -- competitor movement, OTA anomalies. Composed by
  -- src/lib/market/briefing.ts from the day's signals + recommendations.
  body text not null,
  -- Quick-glance counts that drive the "5 opportunities, 2 alerts"
  -- pill row at the top of the briefing card.
  opportunity_count integer not null default 0,
  alert_count integer not null default 0,
  demand_outlook text not null default 'steady', -- 'soft' | 'steady' | 'strong' | 'compressed'
  -- The signals the briefing pulled in, by id. Lets us deep-link
  -- the briefing copy into the underlying card.
  source_signal_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (property_id, briefing_date)
);

create index daily_market_briefings_property_idx
  on public.daily_market_briefings(property_id, briefing_date desc);

alter table public.daily_market_briefings enable row level security;

create policy daily_market_briefings_select_org
  on public.daily_market_briefings for select
  using (
    public.is_platform_admin() or
    exists (
      select 1
      from public.properties p
      where p.id = daily_market_briefings.property_id
        and p.org_id = public.current_org_id()
    )
  );

comment on table public.daily_market_briefings is
  'Top-of-page executive AI briefing — one row per property per day. The primary "what should I pay attention to today" surface. Composed from signals + recommendations + competitor activity.';
