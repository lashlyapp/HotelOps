# Revenue Intelligence — architecture, pipeline, and task tracker

> **Status:** Active. PR #39 shipped the storage layer + heuristic v1.
> This doc is the single source of truth for the feature going forward.
> Edit as we learn; do not let it rot.

## Why this feature exists

MyHotelOps' wedge against Lighthouse (mylighthouse.com) for the
boutique / independent hotel segment. Strategic premise:

- Boutique hotels can't afford analyst tools or PMS-integrated
  enterprise suites
- They lack the time to configure comp sets, model pricing, or read
  dashboards
- They DO benefit massively from a daily "what should I pay attention
  to today?" briefing driven by real market signal

**Product principle**: the platform should feel *automatic and
invisible*. The GM never configures anything. They open `/market` and
intelligence is already populated. The morning email lands before
their first coffee.

## Competitive posture vs Lighthouse

| Dimension | Lighthouse | MyHotelOps Revenue Intelligence |
|---|---|---|
| Buyer | Revenue analysts, enterprise hotels | GMs and owner-operators of boutique hotels |
| Price | $300–800 / property / month | Bundled in the base license |
| Setup | Manual comp set, dashboard config, contract | Auto-detected; zero config |
| UX | 30+ dashboards | One daily briefing + a handful of opportunity cards |
| Data sources | Premium licensed feeds (Booking, Expedia direct) | Free APIs + OTA affiliate programs + crowdsourced peer ADR |
| PMS integration | Often required | **Never required — by design** |
| Recommendation style | Spreadsheets and charts | Single-sentence, confident, conversational copy |

**Where Lighthouse wins today and what we copy:**
- Their breadth of comp-set data (we close this gap via Booking + Expedia affiliate APIs + direct-widget readers + peer ADR pool)
- Their forward-looking rate intelligence (we replicate via competitor_rate_snapshots driven by the same affiliate APIs)

**Where we beat them and what we double down on:**
- Conversational AI briefing as the primary surface (they're dashboard-first; we're prose-first)
- Non-OTA demand sources Lighthouse doesn't pull: university calendars, weather disruption, search-intent trends, wedding-venue activity
- One bundled price vs their per-feature SKUs
- Mobile-first, executive-tone copy vs dense BI

## Pipeline architecture

```
   EXTERNAL SOURCES                INGESTION                STORAGE LAYERS                  CONSUMERS
   ─────────────────                ─────────                ──────────────                  ─────────

   Free APIs (no key)
   ├─ Nager.Date holidays  ─┐
   ├─ Open-Meteo weather    │
   ├─ Wikipedia events      ├─►  per-source cron     ──►  L0: data_source_registry
   ├─ Wikipedia pageviews   │    (Vercel scheduled)        (one row per source,
   ├─ exchangerate.host     │                               enabled flag, health)
   ├─ NWS / NOAA alerts     │                                       │
   ├─ AirNow AQI            │                                       ▼
   └─ OpenStreetMap         │                              L1: external_observations
                            │                              (raw + cleansed payloads,
   Free APIs (key required) │                               retained forever)
   ├─ Ticketmaster          │                                       │
   ├─ Eventbrite            │                                       │ normalizers (pure fns)
   └─ Songkick              │                                       ▼
                            │                              L2: NORMALIZED ENTITIES
   OTA affiliate (approval) │                              ──────────────────────
   ├─ Booking.com Affiliate │                              events_catalog
   ├─ Expedia Rapid (EAN)   │                              venues_catalog
   ├─ Hotelbeds             │                              holidays_catalog
   └─ Travelpayouts agg.    │                              weather_observations
                            │                              (later) competitor_properties
   Direct-widget readers    │                                       competitor_rate_snapshots
   ├─ Cloudbeds             │                                       review_observations
   ├─ SiteMinder            │                                       search_demand_observations
   ├─ Mews                  │                                       peer_adr_observations
   └─ Little Hotelier      ─┘                                       │
                                                                    │ signal builders
   Public scrapes (cautious)                                        ▼
   ├─ Google Trends (pytrends-style)                       L3: SIGNALS (per property)
   ├─ Wikipedia pageviews                                  ──────────────────────────
   ├─ Google Maps reviews                                  market_demand_signals
   ├─ TripAdvisor reviews                                  review_sentiment_signals
   ├─ Wikipedia event lists                                search_intent_signals
   ├─ CVB calendars                                        weather_disruption_signals
   ├─ University calendars                                 parity_observations
   └─ Cruise port schedules                                peer_benchmark_signals
                                                                    │
                                                                    │ recommendation engine
                                                                    ▼
                                                            L4: RECOMMENDATIONS & BRIEFING
                                                            ──────────────────────────────
                                                            pricing_recommendations
                                                            daily_market_briefings
                                                                    │
                                                                    ▼
                                                            /market, /api/market/*,
                                                            daily email digest
```

## Layer-by-layer detail

### L0 — Data source registry
Every source is a row in `data_source_registry`. `enabled` controls
whether the cron actually fetches; flipping it off in the admin UI
halts that source without code changes. **Default enabled.**

### L1 — Raw observations (retained forever)
Every adapter writes to `external_observations`:

- `payload` — **cleansed** representation (typed, normalized units, geo
  normalized, PII stripped)
- `payload_raw` — original API response for audit / reprocessing
- No TTL — historical analysis depends on this layer. Indexes and
  partitioning sized for indefinite retention.

### L1.5 — Cleansing
Cleansing runs *inside the adapter*, before write:

1. **Schema validation** — reject rows that don't conform to the
   adapter's expected shape; log to `data_source_runs.error_sample`
2. **Geo normalization** — lat/lon snapped to 6 decimals; city_key
   computed via slugifier (`city:charleston-sc-us`)
3. **Time normalization** — all timestamps stored as `timestamptz` in
   UTC; source-local time preserved in `payload.local_time`
4. **Text sanitization** — review text trimmed to 8KB, control chars
   stripped, language-detected
5. **PII stripping** — review author names hashed; phone / email
   patterns scrubbed from event descriptions
6. **Deduplication** — within an adapter run, dedupe by (target_key,
   observed_at)
7. **Unit normalization** — currencies stored as decimal in the source
   currency; converted lazily at signal time
8. **Source attribution** — every row carries `source` + `source_run_id`
   so we can later disqualify entire runs if a source proves bad

### L2 — Normalized entities
Pure-function normalizers consume L1 and upsert into typed catalog
tables. Idempotent: re-running a normalizer produces the same L2
state. This is where deduplication across sources happens (e.g. an
event that appears in both Ticketmaster and Eventbrite collapses to
one `events_catalog` row by fuzzy match on name + start + venue).

### L3 — Signals
Pure-function signal builders consume L2 and per-property profile data
to produce property-specific actionable signals. Already-shipped tables
(`market_demand_signals`, `pricing_recommendations`,
`daily_market_briefings`) populate from real data now.

### L4 — Surfaces
- `/market` — primary GM surface (shipped)
- `/market/settings` — profile editor (shipped)
- `/admin/data-sources` — pipeline health + enable/disable (shipping in
  this PR)
- Daily email digest (planned)
- Slack/email priority-5 alerts (planned)

### Observability
- `data_source_runs` — one row per cron invocation, status, counts,
  errors
- `/admin/data-sources` — last 24h run health per source

## Data retention policy

**Retain everything.** Historical comp-rate, demand, review, and
search-intent data becomes a per-city training set over time — the
long-term moat. Concrete:

- `external_observations` — forever
- L2 entity tables — forever
- L3 signal tables — forever
- `data_source_runs` — 1 year (housekeeping cron prunes; raw obs
  retain their `source_run_id` even after the run row is gone)

When tables exceed 100M rows, partition by month. We won't hit that
boundary for years.

## Source roster

### Active (PR 2 — this PR)
| Source | Layer | Key needed | Notes |
|---|---|---|---|
| Nager.Date | Holidays | None | Global public holidays |
| Open-Meteo | Weather | None | 14-day forecast, severe alerts |
| Wikipedia events | Events | None | Annual festivals, recurring events |

### Approved next (PR 3)
| Source | Layer | Key needed | Notes |
|---|---|---|---|
| Ticketmaster Discovery | Events | Free key (10 min signup) | Concerts, sports, theater |
| Eventbrite Public Search | Events | Free key | Local independent events |
| exchangerate.host | FX | None | Inbound international FX |
| NWS API | Weather alerts | None | US severe weather |
| OpenStreetMap Overpass | Venues | None | Nearby venues, capacity |

### Approved later (PR 4)
| Source | Layer | Key needed | Notes |
|---|---|---|---|
| Booking.com Affiliate | Comp rates | Affiliate approval (~1 wk) | Primary comp-rate source |
| Expedia Rapid (EAN) | Comp rates | Affiliate approval (~1–2 wk) | Secondary |
| Hotelbeds | Comp rates | Free signup | Independent coverage |
| Cloudbeds / SiteMinder / Mews direct widgets | Comp rates | None | Per-engine work |

### Approved finally (PR 5+)
| Source | Layer | Key needed | Notes |
|---|---|---|---|
| Google Maps reviews (scrape) | Reviews | None (cautious) | Property + competitors |
| Google Trends (pytrends-style) | Search intent | None (cautious) | Destination demand |
| Wikipedia pageviews | Search intent | None | Destination leading indicator |
| TripAdvisor (scrape) | Reviews | None (cautious) | Reviews + rankings |
| Peer ADR pool | Crowdsourced | Customer opt-in | k-anonymity ≥3 |

## Code layout

```
src/lib/market/
  sources/                    # adapters — one file per source
    nager-holidays.ts
    open-meteo.ts
    wikipedia-events.ts
    ticketmaster.ts           # (planned)
    booking-affiliate.ts      # (planned)
    ...
    types.ts                  # Observation, AdapterResult shared types
    runner.ts                 # adapter execution + cleansing + write
    cleansing.ts              # geo, time, text, PII helpers
  normalizers/
    holidays.ts               # external_observations → holidays_catalog
    weather.ts                # → weather_observations
    events.ts                 # → events_catalog (+ venues_catalog)
  signals/
    demand.ts                 # L2 → market_demand_signals
  registry.ts                 # data_source_registry helpers
  refresh.ts                  # orchestrator (shipped)
  briefing.ts                 # (shipped)
  recommendations.ts          # (shipped)
  ...

src/app/api/cron/
  scrape-holidays/route.ts
  scrape-weather/route.ts
  scrape-wikipedia-events/route.ts
  build-demand-signals/route.ts
  ...

src/app/(admin)/admin/data-sources/
  page.tsx                    # source registry table
  actions.ts                  # toggle enable/disable, run-now
```

## Operator runbook

- **A source is failing**: check `/admin/data-sources` for last error,
  drill into `data_source_runs` for the full sample. Disable the
  source if the failure persists; signals degrade gracefully when a
  source is empty.
- **A new property's `/market` is empty**: on-demand refresh triggers
  on first visit (`refreshMarketIntelligence`). Confirm
  `data_source_registry.enabled = true` for the sources that feed the
  property's geo.
- **Adding a new source**: implement adapter in
  `src/lib/market/sources/`, add normalizer, add cron route, insert
  registry row in a migration. Pipeline picks it up automatically.

---

# Task tracker — owner actions

Tasks the owner must complete for the pipeline to be fully live.
Status updated as items are reported done.

## Phase 1 — Free sources, no approvals
- [ ] Confirm PR is merged and migration applied
- [ ] Visit `/admin/data-sources` and verify all rows show "enabled"
- [ ] Manually trigger each Phase 1 source via the "Run now" button
- [ ] Confirm `/market` for a real property shows a demand signal sourced from Wikipedia events or Nager.Date holidays

## Phase 2 — Free API keys (10 minutes each)
- [ ] Sign up for **Ticketmaster Discovery API** at developer.ticketmaster.com → add key as `TICKETMASTER_API_KEY` env var
- [ ] Sign up for **Eventbrite API** at eventbrite.com/platform → add key as `EVENTBRITE_API_TOKEN` env var
- [ ] Sign up for **AirNow API** (optional, US air quality) at docs.airnowapi.org → add key as `AIRNOW_API_KEY`

## Phase 3 — OTA affiliate approvals (1–2 weeks each, do in parallel)
- [ ] Apply for **Booking.com Affiliate Partner** at partner.booking.com → on approval, add credentials as `BOOKING_AFFILIATE_*` env vars
- [ ] Apply for **Expedia Group Rapid (EAN)** at developers.expediagroup.com → add credentials as `EXPEDIA_RAPID_*` env vars
- [ ] (Optional, fastest) Apply for **Travelpayouts** at travelpayouts.com → add `TRAVELPAYOUTS_API_TOKEN`
- [ ] Apply for **Hotelbeds** at developer.hotelbeds.com → add `HOTELBEDS_*` env vars

## Phase 4 — Optional product decisions
- [ ] Decide: turn on peer ADR pool (requires customer opt-in flow build) — yes/no
- [ ] Decide: ship daily email digest at 6am local — yes/no
- [ ] Decide: ship Slack/email push for priority-5 recommendations — yes/no
- [ ] Decide: pricing (currently bundled in base; revisit when KPIs stabilize)

## Phase 5 — Long-tail (defer until P1–P3 producing value)
- [ ] Map common boutique direct-booking engines for our customer base (which use Cloudbeds, SiteMinder, Mews?)
- [ ] Build per-engine direct-widget readers
- [ ] Wire Google Maps + TripAdvisor review scrapes
- [ ] Wire Google Trends pytrends-style scraper

---

> **Reporting back**: when an item is done, message "task N done" or the
> equivalent and we'll check it off here.
