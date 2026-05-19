# Revenue Intelligence — Architecture, Pipeline, and Resume Guide

> **Status:** Feature-complete v1 on branch `claude/add-revenue-intelligence-WgjbW`, PR #39.
> Last updated: 2026-05-19. Resume here when you're ready to pick this back up.

---

## Strategic positioning (the boundaries that govern every decision)

### What this IS

An **AI-powered external hospitality market intelligence layer** for independent
and boutique hotels. The product answers one question:

> **"What should this hotel pay attention to today?"**

Surfaced as: a daily executive briefing + a handful of opportunity cards + a
review-intelligence panel + a comp-set view. Nothing more.

### What this is NOT

- **NOT** a PMS, booking engine, RMS, or hotel OS replacement
- **NOT** an integration into any PMS / reservation / booking / internal hotel system
- **NOT** an analyst dashboard, BI tool, RevPAR/occupancy chart, or pace forecaster
- **NOT** a configuration-heavy enterprise workflow

This is **deliberate.** The product wins the boutique segment precisely *because*
it skips PMS integration and analyst tooling.

### Competitive frame

| Dimension | Lighthouse (the giant we wedge against) | MyHotelOps Revenue Intelligence |
|---|---|---|
| Buyer | Revenue analysts, enterprise chains | GMs and owner-operators of boutiques |
| Price | $300–800 / property / month | Bundled in the base license |
| Setup | Manual comp-set, contracts | Zero — comp set auto-discovered from OSM |
| UX | 30+ dashboards | One briefing + opportunity cards |
| Data | Premium licensed feeds | Free APIs + OTA affiliate (free) + crowdsourced peer ADR |
| PMS integration | Often required | **Never required by design** |
| Recommendation style | Spreadsheets + charts | Single-sentence, confident, conversational |

---

## Current state — what's actually built

### Branch: `claude/add-revenue-intelligence-WgjbW` (PR #39, 6 commits)

```
ac78a9f market: email preview, source-health alerts, recommendation snapshot tests
c99ba25 market: polish layer — recommendation v2, admin drill-in, AI briefing, sparkline
44af955 market: ship OTA rate adapters, peer benchmark, daily email digest
1ed7995 market: complete data pipeline expansion — 7 new sources, real comp set, review intelligence
d3d0303 market: fix holidays_catalog UNIQUE — use plain columns, not expression
aebca4d market: build out free-source data pipeline + admin controls
a5a7d95 market: add Revenue Intelligence as the AI commercial copilot wedge
```

### Migrations (in order, all on branch)

| File | What it does |
|---|---|
| `20260522000000_revenue_intelligence.sql` | L3 + L4 storage: market profile, competitor set, demand signals, pricing recommendations, daily briefings |
| `20260522010000_revenue_intelligence_pipeline.sql` | L0 source registry, L1 raw observations (retained forever), L2 events/venues/holidays/weather catalogs, data_source_runs |
| `20260522020000_revenue_intelligence_expansion.sql` | L2 disruption / search demand / FX / reviews + L3 review_sentiment / search_intent / weather_disruption signals; TripAdvisor URL + Google Place ID columns |
| `20260522030000_revenue_intelligence_rates.sql` | competitor_rate_snapshots (24h TTL on reads), property_rate_parity_snapshots, peer_adr_observations (k-anonymous), peer_benchmark_signals; daily-digest plumbing |
| `20260522040000_revenue_intelligence_health.sql` | `last_health_alert_at` column on registry for the hourly source-health monitor |

### Adapters (13 total)

**Live (no API key required):**
| File | Source | Layer fed |
|---|---|---|
| `src/lib/market/sources/nager-holidays.ts` | Nager.Date public holidays | holidays_catalog → demand signals |
| `src/lib/market/sources/open-meteo.ts` | Open-Meteo weather forecast | weather_observations → demand + weather_disruption signals |
| `src/lib/market/sources/wikipedia-events.ts` | Wikipedia annual events | events_catalog → demand signals |
| `src/lib/market/sources/nws-alerts.ts` | NWS severe weather alerts (US) | disruption_observations → weather_disruption_signals |
| `src/lib/market/sources/wikipedia-pageviews.ts` | Wikipedia destination pageviews | search_demand_observations → search_intent_signals |
| `src/lib/market/sources/exchange-rate.ts` | exchange-rate.host FX | fx_observations |
| `src/lib/market/sources/overpass.ts` | OpenStreetMap nearby venues **and real comp-set discovery** | venues_catalog + property_competitor_set |
| `src/lib/market/sources/tripadvisor.ts` | Customer-URL TripAdvisor scrape | review_observations → review_sentiment_signals |

**Prebuilt, gated on env keys you haven't applied for yet:**
| File | Source | Env keys |
|---|---|---|
| `src/lib/market/sources/ticketmaster.ts` | Concerts / sports / theater | `TICKETMASTER_API_KEY` |
| `src/lib/market/sources/eventbrite.ts` | Local independent events | `EVENTBRITE_API_TOKEN` |
| `src/lib/market/sources/booking-affiliate.ts` | Booking.com Distribution v2 | `BOOKING_AFFILIATE_USERNAME` + `BOOKING_AFFILIATE_PASSWORD` |
| `src/lib/market/sources/expedia-rapid.ts` | Expedia Rapid (EAN) v3 | `EXPEDIA_RAPID_API_KEY` + `EXPEDIA_RAPID_API_SECRET` |
| `src/lib/market/sources/hotelbeds.ts` | Hotelbeds Hotel API 1.0 | `HOTELBEDS_API_KEY` + `HOTELBEDS_API_SECRET` |

Every adapter writes through `src/lib/market/sources/runner.ts` (cleansing →
`external_observations` → `data_source_runs`). Shared cleansing helpers in
`src/lib/market/sources/cleansing.ts`. Shared types in `types.ts`. Adapter
context in `context.ts` (loads properties + per-city geocode cache from
Open-Meteo geocoding API, no key needed).

### Normalizers (L1 → L2)

`src/lib/market/normalizers/` — one per L2 table:
- `holidays.ts`, `weather.ts`, `events.ts`, `disruptions.ts`,
- `search-demand.ts`, `fx.ts`, `reviews.ts`, `rates.ts`,
- `venues.ts` (special — also routes OSM hotel rows into `property_competitor_set` for real comp-set discovery, replacing the v1 synthetic name generator)

### Signal builders (L2 → L3)

`src/lib/market/signals/`:
- `demand.ts` — `market_demand_signals` from events + holidays + weather
- `weather-disruption.ts` — `weather_disruption_signals` from disruption + weather obs
- `search-intent.ts` — `search_intent_signals` from pageviews (7d vs 28d avg)
- `review-sentiment.ts` — `review_sentiment_signals` from review obs (30d window, top complaint/praise theme extraction, comp-set comparison)
- `parity.ts` — `property_rate_parity_snapshots` from competitor_rate_snapshots
- `peer-benchmark.ts` — `peer_benchmark_signals` + handles anonymized contribution; **k-anonymity ≥ 3 enforced**

### Recommendation engine

`src/lib/market/recommendations.ts`:
- **Pure rule evaluator** `evaluateRecommendationRules(args)` — takes all inputs, returns rows. No DB I/O. **Snapshot-tested in `recommendations.test.ts` (13 tests).**
- **Orchestrator** `refreshPricingRecommendations(...)` — does the I/O, calls the evaluator, writes the rows.
- Rules in current order: per-signal lift → weekend lift → heuristic comp parity (fallback) → **real parity** (preferred when present) → **compression alert** → visibility check (only when no real parity exists).

### Briefing composer

`src/lib/market/briefing.ts` + `briefing-ai.ts`:
- Rule-based composer builds a deterministic headline + body from the signal set.
- AI polish layer (gated on `OPENAI_API_KEY`) sends draft + raw signals to
  gpt-4o-mini, gets natural prose back. Falls back to the rule-based version
  silently on key-missing / API-fail. Cost ≈ $0.001 / property / day.

### Surfaces (user-facing)

| Path | Purpose |
|---|---|
| `/market` | GM landing — briefing card + outlook sparkline + recommendations + demand list + review intelligence + comp set |
| `/market/settings` | Profile (segment, tier, ADR band, location, TripAdvisor URL) + org-wide preferences (peer ADR opt-in, email opt-out) |
| `/admin/data-sources` | Pipeline health: all 15 sources with toggle + Run-now + per-source health |
| `/admin/data-sources/[source]` | Drill-in: configuration, last 30 runs with errors, latest observation JSON |
| `/admin/market-briefing/preview` | Eyeball tomorrow's morning email per property before send |

### Email digest

`src/lib/email/market-briefing.ts` + `/api/cron/send-market-briefing-email`:
- Sends one email per (property, day) at **13:00 UTC** (≈ 6am Eastern / 8am
  Western)
- Subject line adapts to outlook ("comp set compressing…", "X opportunities…")
- Deduped via `briefing_email_log`
- Org-level opt-out via `organizations.market_briefing_email_opt_out`
- **Known gap**: not yet timezone-aware per property — see resume notes

### Source-health monitor

`/api/cron/source-health-check` — hourly:
- Classifies every registry source: healthy / erroring / stale / awaiting_key / disabled / no_runs
- Emails platform admins on erroring or stale sources
- Deduped 24h via `data_source_registry.last_health_alert_at`

### Tests

108 tests pass via `npm test`:
- 95 pre-existing
- 7 in `src/lib/market/random.test.ts` (seeded RNG, deterministic pickers)
- 13 in `src/lib/market/recommendations.test.ts` (rule evaluator snapshot tests)

---

## Pipeline architecture (the diagram)

```
   EXTERNAL SOURCES                INGESTION                STORAGE LAYERS                  CONSUMERS
   ─────────────────                ─────────                ──────────────                  ─────────

   Free APIs (no key)
   ├─ Nager.Date holidays  ─┐
   ├─ Open-Meteo weather    │
   ├─ Wikipedia events      ├─►  per-source cron     ──►  L0: data_source_registry
   ├─ Wikipedia pageviews   │    (Vercel scheduled)        (one row per source,
   ├─ exchangerate.host     │                               enabled flag, health)
   ├─ NWS severe alerts     │                                       │
   └─ OSM Overpass          │                                       ▼
                            │                              L1: external_observations
   Free APIs (key required) │                              (raw + cleansed payloads,
   ├─ Ticketmaster          │                               retained forever)
   └─ Eventbrite            │                                       │
                            │                                       │ normalizers (pure fns)
   OTA affiliate (approval) │                                       ▼
   ├─ Booking.com Affiliate │                              L2: NORMALIZED ENTITIES
   ├─ Expedia Rapid (EAN)   │                              events_catalog
   └─ Hotelbeds             │                              venues_catalog
                            │                              holidays_catalog
   Customer-consent         │                              weather_observations
   └─ TripAdvisor          ─┘                              disruption_observations
                                                          search_demand_observations
                                                          fx_observations
                                                          review_observations
                                                          competitor_rate_snapshots
                                                          peer_adr_observations
                                                                    │
                                                                    │ signal builders
                                                                    ▼
                                                            L3: SIGNALS (per property)
                                                            market_demand_signals
                                                            weather_disruption_signals
                                                            search_intent_signals
                                                            review_sentiment_signals
                                                            property_rate_parity_snapshots
                                                            peer_benchmark_signals
                                                                    │
                                                                    │ recommendation engine
                                                                    ▼
                                                            L4: RECOMMENDATIONS & BRIEFING
                                                            pricing_recommendations
                                                            daily_market_briefings
                                                                    │
                                                                    ▼
                                                            /market, /api/market/*,
                                                            daily email digest
```

### Layer-by-layer

- **L0** — `data_source_registry`. One row per source. `enabled` controls cron execution. Default enabled.
- **L1** — `external_observations`. Every adapter writes here after cleansing. `payload` is cleansed/typed; `payload_raw` preserves the original API response for audit. **Retained forever** per the historical-analysis requirement.
- **L2** — Normalized entity catalogs (events, venues, holidays, weather, disruptions, search demand, FX, reviews, rates). Pure-function normalizers consume L1.
- **L3** — Per-property signal tables. Pure-function builders consume L2 + property profile.
- **L4** — Recommendations + briefing. Composed from L3.

### Data retention

**Everything is retained.** No TTL on observations, catalogs, or signal tables.
The historical record is the long-term moat ("regional demand intelligence").

The one exception: `competitor_rate_snapshots.expires_at` enforces a 24h
"freshness" window for *reads* — this respects the OTA affiliate caching
contracts that prohibit storing live rates >24h for serving. The rows
themselves persist for backtesting.

### Cleansing (L1.5 — at the adapter boundary)

`src/lib/market/sources/cleansing.ts`:

1. Schema validation — reject rows that don't conform to the adapter's expected shape
2. Geo normalization — `buildCityKey()` produces stable `city:charleston-sc-us` keys; `buildGeoPointKey()` snaps to 3 decimals (~110m)
3. Time normalization — all timestamps stored as `timestamptz` UTC
4. Text sanitization — `sanitizeText()` strips control chars, caps byte length
5. PII stripping — `stripPii()` redacts email + phone patterns (review text, event descriptions)
6. Reviewer anonymity — `hashForAnonymity()` HMAC-SHA256 with `PEER_HASH_SALT`
7. Dedup — within an adapter run, `dedupeObservations()` collapses on (target_kind, target_key)

### Cron schedule (vercel.json)

| Path | Schedule |
|---|---|
| `/api/cron/scrape-holidays` | weekly Mon 03:00 |
| `/api/cron/scrape-weather` | every 6h |
| `/api/cron/scrape-wikipedia-events` | weekly Mon 04:00 |
| `/api/cron/scrape-nws-alerts` | every 3h |
| `/api/cron/scrape-pageviews` | daily 08:00 |
| `/api/cron/scrape-fx` | daily 09:00 |
| `/api/cron/refresh-venues` | weekly Sun 02:00 |
| `/api/cron/scrape-ticketmaster` | every 2h |
| `/api/cron/scrape-eventbrite` | every 6h |
| `/api/cron/scrape-tripadvisor` | daily 07:00 |
| `/api/cron/scrape-booking-rates` | 04:00 + 16:00 |
| `/api/cron/scrape-expedia-rates` | 04:30 + 16:30 |
| `/api/cron/scrape-hotelbeds-rates` | 05:00 + 17:00 |
| `/api/cron/send-market-briefing-email` | daily 13:00 |
| `/api/cron/source-health-check` | every hour :15 |

All cron handlers verify `Authorization: Bearer ${CRON_SECRET}` via
`src/lib/market/sources/cron-auth.ts`.

---

## File map (where everything lives)

```
src/lib/market/
  sources/                       # one adapter per file
    types.ts                     # Adapter, Observation, AdapterContext
    cleansing.ts                 # geo, time, text, PII helpers
    context.ts                   # buildAdapterContext (loads properties + geocodes)
    runner.ts                    # runAdapter + persistence
    rate-context.ts              # buildRateTargets for OTA adapters
    cron-auth.ts                 # verifyCronAuth
    {source}.ts                  # 13 adapter files (one per source)
  normalizers/
    holidays.ts, weather.ts, events.ts, disruptions.ts,
    search-demand.ts, fx.ts, reviews.ts, rates.ts, venues.ts
  signals/
    demand.ts                    # market_demand_signals
    weather-disruption.ts
    search-intent.ts
    review-sentiment.ts
    parity.ts                    # property_rate_parity_snapshots
    peer-benchmark.ts            # peer_benchmark_signals (k-anon)
  profile.ts                     # auto-detect market profile from properties row
  competitors.ts                 # SYNTHETIC fallback comp-set generator (legacy; real one is OSM in normalizers/venues.ts)
  demand.ts                      # SYNTHETIC fallback demand signals
  briefing.ts                    # rule-based + AI-polished composer
  briefing-ai.ts                 # OpenAI polish (gated on OPENAI_API_KEY)
  recommendations.ts             # evaluateRecommendationRules (pure) + refresh orchestrator
  recommendations.test.ts        # 13 snapshot tests
  refresh.ts                     # end-to-end /market refresh
  registry.ts                    # data_source_registry helpers + health classification
  health.ts                      # source-health classifier
  random.ts + random.test.ts     # seeded RNG (for synthetic fallbacks)

src/lib/email/
  market-briefing.ts             # sendMarketBriefingEmail + renderMarketBriefingEmail
  source-health-alert.ts         # sendSourceHealthAlert

src/app/api/cron/
  scrape-{source}/route.ts       # 13 cron endpoints
  send-market-briefing-email/route.ts
  source-health-check/route.ts

src/app/(app)/market/
  page.tsx                       # /market — main GM surface
  actions.ts                     # server actions: refresh, save profile, save prefs, act on rec
  _components/                   # briefing-card, recommendations-list, demand-list,
                                 #   competitor-list, review-intelligence-card,
                                 #   outlook-sparkline, property-tabs, refresh-form
  settings/
    page.tsx                     # /market/settings
    _components/profile-form.tsx
    _components/preferences-form.tsx

src/app/(admin)/admin/
  data-sources/
    page.tsx                     # pipeline health + toggles
    [source]/page.tsx            # per-source drill-in
    actions.ts                   # toggle + run-now actions
    _components/toggle-form.tsx, run-now-form.tsx
  market-briefing/preview/page.tsx  # email preview

supabase/migrations/
  20260522000000_revenue_intelligence.sql          # L3 + L4
  20260522010000_revenue_intelligence_pipeline.sql # L0 + L1 + L2 base
  20260522020000_revenue_intelligence_expansion.sql # L2 + L3 expansion
  20260522030000_revenue_intelligence_rates.sql    # rates + peer + email
  20260522040000_revenue_intelligence_health.sql   # health monitor

docs/revenue-intelligence.md     # ← this file
```

---

## Source roster (the registry)

15 rows in `data_source_registry`. Status reflects what's runnable end-to-end:

| Source | Live? | Why not (if not) |
|---|---|---|
| nager_holidays | ✅ | — |
| open_meteo | ✅ | — |
| wikipedia_events | ✅ | — |
| nws_alerts | ✅ | — |
| wikipedia_pageviews | ✅ | — |
| exchange_rate_host | ✅ | — |
| overpass_venues | ✅ | — |
| tripadvisor | ✅ | per-property — gated on operator providing URL in `/market/settings` |
| ticketmaster | ⏸ Awaiting key | `TICKETMASTER_API_KEY` (free signup, 10 min) |
| eventbrite | ⏸ Awaiting key | `EVENTBRITE_API_TOKEN` (free signup, 10 min) |
| airnow_aqi | ⏸ Awaiting key | `AIRNOW_API_KEY` (optional, US AQI) — **adapter not yet implemented** |
| booking_affiliate | ⏸ Awaiting affiliate approval | `BOOKING_AFFILIATE_USERNAME` + `BOOKING_AFFILIATE_PASSWORD` |
| expedia_rapid | ⏸ Awaiting affiliate approval | `EXPEDIA_RAPID_API_KEY` + `EXPEDIA_RAPID_API_SECRET` |
| hotelbeds | ⏸ Awaiting approval | `HOTELBEDS_API_KEY` + `HOTELBEDS_API_SECRET` |
| google_maps_reviews | ⏸ Adapter not implemented | Lower priority — TripAdvisor covers reviews already |
| google_trends | ⏸ Adapter not implemented | Lower priority — Wikipedia pageviews covers search intent already |

---

## Resume guide — picking back up later

### Step 1: Verify the PR state

```sh
git fetch origin
git checkout claude/add-revenue-intelligence-WgjbW
npm install
npm test                 # expect 108 pass
npm run build            # expect clean
```

Then check PR #39 on GitHub — confirm CI is green and there are no
unaddressed review comments.

### Step 2: Decide whether to merge before continuing

- **If you want real data flowing now**: merge to main, apply for API keys, observe.
- **If you want to keep iterating**: leave the PR open and keep building on the branch.

The architecture supports either path. The CI's "Apply migrations" job will
push the schema to your remote Supabase as soon as a push to main lands.

### Step 3: Pick up where we left off

Three honest categories of remaining work:

#### A. Operational improvements (clear value, small scope)
1. **Per-property timezone-aware email send** — currently all morning emails go at 13:00 UTC. Should split into a few timezone bands so a Western GM gets it ~6am local and an Asia-Pacific GM doesn't get it at midnight. Approach: add `properties.timezone` (or infer from country/state), bucket properties into 4 sends across the day.
2. **AirNow AQI adapter** — registry row already exists with `airnow_aqi` source. Build the adapter (US-only, free with key), feed disruption_observations.

#### B. Depth features (worth doing if customers ask)
3. **Cloudbeds / SiteMinder / Mews direct-widget readers** — for boutiques whose competitors aren't on big OTAs. One adapter per booking-engine. Pattern matches the existing OTA adapters. **Brittle without integration testing — wait until a customer asks.**
4. **A/B prose variants for the briefing** — pick the best-performing tone over time via thumbs feedback (mirrors the social-studio pattern in `src/app/(app)/social/`).
5. **Google Trends pytrends-style scraper** — duplicate signal with Wikipedia pageviews; skip unless a customer specifically wants it.
6. **Google Maps reviews scraper** — duplicate signal with TripAdvisor; skip unless needed.

#### C. Marketing / GTM (separate workstream)
7. **Public marketing page** at `/lp/revenue-intelligence` — landing page, screenshots, comparison to Lighthouse. Plumb into `docs/pricing.md`.
8. **Pricing reconciliation** — currently bundled in base. Once usage data accumulates, decide whether to break out (see "Pricing notes" below).

### Step 4: Quick orientation when picking back up

- Read this doc top to bottom (~10 min)
- Run `npm test` to confirm the rule evaluator behaves as expected (13 snapshot tests)
- Open `/admin/data-sources` against staging to see live source health
- Open `/market` for one property to see the GM-facing surface
- Open `/admin/market-briefing/preview` to see what the morning email looks like

---

## Owner task tracker

Tasks the owner (you) must complete for the pipeline to be fully live.
Status updated as items are reported done.

### Phase 1 — verify foundation (after merge, ~5 min)
- [ ] Confirm CI is green on PR #39
- [ ] Merge PR #39
- [ ] Confirm migrations applied to remote Supabase (CI does this automatically)
- [ ] Visit `/admin/data-sources` and verify all 15 sources show in the registry
- [ ] Manually trigger Nager.Date, Open-Meteo, Wikipedia events via "Run now"
- [ ] Confirm `/market` for a real property shows a real-data signal

### Phase 2 — free API keys (~30 min total)
- [ ] Sign up for **Ticketmaster Discovery** at developer.ticketmaster.com → set `TICKETMASTER_API_KEY`
- [ ] Sign up for **Eventbrite** at eventbrite.com/platform → set `EVENTBRITE_API_TOKEN`
- [ ] Sign up for **AirNow** (optional, US AQI) at docs.airnowapi.org → set `AIRNOW_API_KEY` (adapter still needs building — see Resume #A.2)
- [ ] Set `PEER_HASH_SALT` to a long random string (used for HMAC of reviewer + org IDs)
- [ ] Set `OPENAI_API_KEY` if not already set (already present from Social Studio)

### Phase 3 — OTA affiliate approvals (1–2 weeks each, apply in parallel; adapters are prebuilt)
- [ ] Apply for **Booking.com Affiliate Partner** at partner.booking.com → set `BOOKING_AFFILIATE_USERNAME` + `BOOKING_AFFILIATE_PASSWORD`
- [ ] Apply for **Expedia Group Rapid (EAN)** at developers.expediagroup.com → set `EXPEDIA_RAPID_API_KEY` + `EXPEDIA_RAPID_API_SECRET`
- [ ] Apply for **Hotelbeds** at developer.hotelbeds.com → set `HOTELBEDS_API_KEY` + `HOTELBEDS_API_SECRET`
- [ ] (Optional, fastest approval) Apply for **Travelpayouts** — adapter not yet built but easy to add against same pattern

### Phase 4 — operator workflow (customers do this on `/market/settings`)
- [ ] Each customer: paste **TripAdvisor URL** to enable review intelligence
- [ ] Each customer: toggle **peer ADR opt-in** to contribute to the city benchmark

### Phase 5 — product decisions to revisit
- [ ] Pricing: keep bundled in base, or break out as a paid add-on once value is proven
- [ ] Timezone-aware email digest (currently 13:00 UTC for everyone)
- [ ] Slack / push notifications for priority-5 recommendations
- [ ] Per-property direct-booking-widget readers (Cloudbeds, SiteMinder, Mews)

---

## Decision log — the reasoning behind key choices

These are the "why" behind decisions that future-you might be tempted to
re-litigate.

### Why we dropped Yelp Fusion
Yelp's coverage of hotels is patchy — it's restaurant-focused. Most
boutique listings have <10 reviews. Free tier (500 calls/day) is
mathematically fine, but the data behind it isn't worth the call.
TripAdvisor is hospitality's actual review standard.

### Why TripAdvisor URL is operator-supplied, not auto-discovered
Two reasons:
1. **Consent posture** — scraping anyone's review page is TOS-grey;
   requiring the customer to explicitly supply their own URL means *they*
   are saying "yes, read my reviews".
2. **Accuracy** — auto-matching "Hotel Aurora" + "Charleston, SC" to a
   specific TripAdvisor listing is error-prone for small boutiques with
   common names. Customer-supplied URL is exact.

### Why we built our own peer ADR benchmark instead of buying a feed
- Free. No API contracts.
- The data IS our customer base — it's a long-term moat that gets stronger as we add customers, not weaker.
- K-anonymity (≥3 contributing orgs per cohort) protects individual contributors.
- Cold start: doesn't work for property #1 in a city. Becomes the dominant signal after 5–10 city customers.

### Why org IDs are HMAC-hashed in peer_adr_observations
We never want a peer ADR row to be reverse-mappable to "Hotel X
contributed". HMAC with `PEER_HASH_SALT` makes the linkage one-way.
If the salt ever leaks, rotate it — old hashes invalidate, contributing
orgs re-write on next refresh.

### Why 24h TTL on competitor_rate_snapshots
OTA affiliate contracts (Booking.com, Expedia Rapid) prohibit storing
live rates beyond 24h for serving. The rows themselves persist (for
backtesting + the historical-analysis requirement); the `expires_at`
column gates which rows the signal builders are allowed to *read*.

### Why retain L1 forever
The user explicitly said historical analysis is in scope. Cleansed
observations + the raw originals are the audit trail. Retention costs
~$0 at our scale; cleansing-at-write means the queryable shape is
stable even if a source's API changes.

### Why no PMS integration
Per the strategic clarification:
> "This module does NOT integrate with PMS systems, reservation systems,
> booking engines, or internal hotel operational systems. This is
> intentional."

Every shortcut that points back at the PMS — "just read the property's
own ADR from Cloudbeds" — is rejected. The product wins precisely
*because* it works without any PMS access.

### Why an AI polish layer on the briefing
Rule-based prose works but feels mechanical. gpt-4o-mini polish makes
it sound human at ~$0.001 / property / day. Critical constraint: the
AI ONLY rewords — all facts and numbers come from the rule-based
composer. The model is told to invent nothing.

### Why operator-typed ADR floor / ceiling on property_market_profile
This is the *only* property-internal datum the module touches. Used
purely as a positioning anchor for the parity computations. NOT
tracked over time, NOT pulled from a PMS, NOT a booking-analytics
input. The strategic doc allows this lightweight input.

### Why the 30-day outlook sparkline
Closest thing to a "chart" in the UI, but it's strictly *external*
market outlook over time — not occupancy, RevPAR, or booking pace.
Tiny visual cue, no interactivity, hover shows date+outlook via SVG
`<title>`. If you decide this drifts toward BI, delete it; nothing
else depends on it.

---

## Pricing notes (the open packaging question)

Currently the strategic doc says:
> All features in 1 license. Boutique market, small budget, feature
> rich, low cost.

So Revenue Intelligence is **bundled in the base $129/property/month
license**. That's documented in `docs/pricing.md`.

Once the OTA adapters are live and customers see real comp rates +
the daily briefing, you may want to revisit whether this should ride
inside the base forever or eventually break out:

| Path | Pro | Con |
|---|---|---|
| Stay bundled | Simpler pitch; max adoption | Underprices the most differentiated feature |
| Break out at $79 / property / month | Captures the "I'd pay Lighthouse $400/mo for this" segment | Adds a tier to the pricing page |

Recommendation: stay bundled through the first 20 paying customers. Decide
once you have data on which customers cite Revenue Intelligence as the
primary purchase reason.

---

## Known gaps / nice-to-haves (not blockers)

- **Timezone-aware email send** — currently all 13:00 UTC
- **AirNow AQI adapter** — registry row exists, adapter doesn't
- **Travelpayouts adapter** — would be a fast addition once approved
- **Songkick / Bandsintown** — registry rows not added; redundant with Ticketmaster
- **Cloudbeds / SiteMinder / Mews direct-widget readers** — pattern is clear, defer until a customer asks
- **Public LP at `/lp/revenue-intelligence`** — needs design + copy work
- **Per-property property-level disable** — `data_source_registry.enabled` is global; no way to say "disable Booking adapter for *this* property"
- **Refresh cadence per-property** — currently uniform global cron; doesn't scale beyond ~500 properties without overlap

None of these block the v1 release. All are worth ~half a day each.

---

> **Reporting status**: when an item is done, message "task N done"
> and the next agent (or future-you) will check it off here.
