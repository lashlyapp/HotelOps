# Digital Signage — Product & Engineering Spec

Status: draft for review
Owner: TBD
Target: v1 MVP in ~6 weeks, v1.1 add-ons in the following 4 weeks

## 1. The wedge in one paragraph

Every horizontal signage SaaS (ScreenCloud, Yodeck, OptiSigns, NoviSign, Rise
Vision) charges per screen. Every hotel-specific signage vendor (Otrum,
Uniguest, Nevotek) charges per room and hides pricing behind a sales call.
HotelOps already bills per **property**, already stores per-property media on
R2 with a zero-egress CDN, and already has authenticated property-scoped data
(events, properties, IT hub). We can ship signage at flat per-property
pricing with unlimited screens, undercut every horizontal vendor on TCO past
3 screens, undercut every hotel incumbent by an order of magnitude, and
absorb 100% of incremental infra cost into a zero-marginal-cost stack.

## 2. Competitive landscape (May 2026)

### Horizontal cloud signage (per-screen SaaS)

| Vendor       | Entry $/screen/mo | Pro $/screen/mo | Notes                                                                 |
| ------------ | ----------------- | --------------- | --------------------------------------------------------------------- |
| Yodeck       | $8                | $11             | Cheapest credible cloud; Pi-based player bundled on annual            |
| OptiSigns    | $10               | $12.50          | Fire TV story; Pro Plus $15, Engage $30                               |
| Rise Vision  | $11               | $13             | K-12 lean; emergency CAP alerts; offline on all tiers                 |
| NoviSign     | $14               | $17             | Touch/kiosk widgets, Zapier                                           |
| ScreenCloud  | $20               | $30             | Enterprise-tilted; deepest app marketplace                            |
| Xibo Cloud   | $4.90             | $19             | Open-source roots; self-host free (AGPL)                              |
| Mvix         | $450–$750 one-time per player | —   | CapEx model, lifetime license                                         |

Median entry tier ≈ **$11/screen/mo**. Median Pro tier ≈ **$15/screen/mo**.

### Hotel-specific incumbents (quote-only, integrator-driven)

| Vendor              | Public pricing | Real-world TCO            | Differentiator                                   |
| ------------------- | -------------- | ------------------------- | ------------------------------------------------ |
| Otrum / Uniguest    | hidden         | $4–$10/room/mo all-in     | PMS integration (Opera, Mews), in-room TV, casting |
| Nevotek SuperSign   | hidden         | enterprise sales          | PMS + MS Exchange for meeting rooms, 30+ langs   |
| Spectrio (ex-Enplug)| hidden         | $25–$40/screen/mo bundled | Music + Wi-Fi marketing cross-sell               |
| Displai (ex-Raydiant)| hidden        | ~$29–$39/loc + /screen    | Loud G2/Capterra complaints re billing & support |

### Open-source / DIY

- **Xibo** — full feature set, AGPL, self-hostable. Reference architecture, not a fork target (AGPL).
- **Anthias** (ex-Screenly OSE) — RPi only, no scheduling depth.
- **Concerto** — campus-origin, thin ecosystem.

### Where the price floor actually is

You cannot beat Xibo Cloud's $4.90/screen on a per-screen basis. **You can
trivially beat all of them by not charging per screen.** A 40-room
boutique hotel typically wants 4–10 screens (lobby, breakroom, 2-3 meeting
rooms, elevator, pool deck, restaurant). At Yodeck $8 that's
$32–$80/mo per property, on top of whatever PMS/signage incumbent they
already pay. We bundle it flat.

## 3. Pricing strategy

**Locked — May 2026.** Canonical: [`docs/pricing.md`](./pricing.md). The
table below is kept for context only.

### Structure

| Plan tier (HotelOps) | Today                  | With signage                                    |
| -------------------- | ---------------------- | ----------------------------------------------- |
| Base                 | $100/property/mo       | $100/property/mo — **3 screens included free**  |
| Signage add-on       | —                      | +$49/property/mo for **unlimited screens**      |
| Overage (no add-on)  | —                      | $5/screen/mo beyond the 3 included              |

Rationale:

- **3 free screens** is the customer-acquisition hook. Every property has a
  lobby TV, a breakroom TV, and at least one meeting board — and they all
  come for free with the existing subscription. Zero friction, zero new
  contract, instantly demoable.
- **$49/property unlimited** is the expansion play. A 6-screen property
  pays $49 (vs. $48 on Yodeck per-screen — break-even at 6, advantage at
  7+). A 20-screen resort pays $49 (vs. $160 on Yodeck, $300+ on
  ScreenCloud, $1,000+ on Otrum). Resorts and meeting-heavy properties
  will buy this without a second thought.
- **$5/screen overage** is the "didn't bother to upgrade" path. Slightly
  punitive vs. the flat plan ($5 × 4 extra screens = $20/mo, vs. $49 flat
  for unlimited) which nudges people into the add-on naturally.

### Stripe wiring

Add two Prices with lookup keys:

- `hotelops_signage_unlimited_monthly` — $49 recurring, qty = property count
- `hotelops_signage_overage_per_screen_monthly` — $5 recurring, qty =
  metered screens beyond 3-per-property allowance

Reuse the existing per-property quantity pattern from
`src/lib/stripe/start-subscription.ts`. Webhook handler in
`src/lib/stripe/webhook.ts` already mirrors price/quantity into
`billing_subscriptions`; extend that table with `signage_addon_active` and
`signage_overage_quantity` columns.

### Margin math

- R2 storage: $0.015/GB-month. A property running 20 GB of signage assets
  = $0.30/mo per property.
- R2 egress to Cloudflare CDN: **$0**. Player downloads from
  `cdn.myhotelops.com`, no transfer cost.
- Postgres rows: negligible (<100 KB/property).
- Vercel function invocations: only the player heartbeat (1/min) and the
  playlist fetch (on change). At 10 screens/property × 1 req/min × 60 ×
  24 × 30 = ~430k invocations/property/month — comfortably inside Pro
  pricing tier per-property economics.

Effective marginal cost: **<$1/property/month**. Gross margin on the $49
add-on: ~98%.

## 4. Feature scope

### v1 MVP — must ship

**Operator UI** (`/signage` route group, sidebar nav next to `/media`):

1. **Screens page** — list registered devices per property, online/offline
   status (last heartbeat < 90s = online), nickname ("Lobby TV"), last
   playlist assigned, "unpair" action.
2. **Pair a screen flow** — operator clicks "Add screen", gets a 6-digit
   pairing code valid for 10 min. On the Fire TV / Android TV / Chromebook,
   open `display.myhotelops.com` in the browser, enter the code. Server
   binds the device.
3. **Playlists** — name, list of items, default duration per item (default
   8s for images). Items are:
   - Image from media library (R2 file picker, reuses `/media`)
   - Video from media library
   - Web URL (sandboxed iframe — operator confirms "I trust this URL")
   - Plain text card (background color + heading + subheading; uses design
     tokens)
4. **Schedules** — assign a playlist to a screen with start/end date and
   optional dayparting (`Mon–Fri 06:00–14:00`). Overlapping schedules
   resolve by priority order. A screen with no active schedule shows the
   property's default playlist.
5. **Emergency broadcast** — owner can push a fullscreen takeover message
   to every screen at a property in one click ("Fire drill — evacuate via
   Stair B"). Clears with another click. Sub-2-second propagation via
   long-poll on player.
6. **Player** — public route `/display/<screen_token>`, no auth, signed
   token only. Fullscreen black background, image/video cycling, polls
   playlist metadata every 60s and prefetches the next 3 items to a
   Service Worker cache for offline playback. Graceful degradation on
   network loss.
7. **Heartbeat & status** — player POSTs `{screen_id, now, current_item,
   user_agent}` every 60s. Surfaces as online/offline + "currently
   playing" in the operator UI.

**Out of scope for v1:**

- Multi-zone layouts (ticker + main + sidebar) — v1.1
- Templates — v1.1
- Touch/kiosk — v2
- PMS integration — v2
- Proof-of-play analytics — v2

### v1.1 — first iteration (4 weeks after MVP)

- **Multi-zone layout templates** — three fixed layouts:
  - Single (full-screen, what v1 ships)
  - Top banner + main (welcome strip + content)
  - Main + bottom ticker (content + RSS/weather/text crawl)
- **Built-in widgets** (no per-tenant API keys):
  - Weather (Open-Meteo, free, geocoded from `properties.address`)
  - Date/time clock with property timezone
  - Property name + logo header
- **Templates library** — pre-built playlists owners can clone:
  - "Lobby Welcome" — property logo + weather + image rotation
  - "Breakroom Bulletin" — internal announcements + ticker
  - "Meeting Room Board" — current/next event from `event_spaces`
  - "Daily Specials" — text cards owners can edit
- **Meeting room boards** — `event_schedule_blocks` already have
  `space_id` + `starts_at` + `ends_at`. A screen tagged to a space
  auto-displays "In session: <event.name> until <ends_at>" or "Available
  until <next.starts_at>". This is Nevotek's flagship feature, given away
  free.
- **Bulk asset push** — "Send this playlist to all screens in this property"
  / "all screens in this org".

### v2 — moat features (quarter 2)

- **PMS-driven welcome screens** — Opera/Mews/Cloudbeds webhook → guest
  name on lobby TV at check-in. Initially manual JSON ingest endpoint;
  per-PMS adapters later.
- **Brand template lock** — for franchisees: admin-locked templates
  enforcing Marriott/Hilton/IHG visual standards. Sold as compliance.
- **Touch/wayfinding kiosk** — interactive directory + map per property.
- **Proof-of-play reports** — exportable CSV of what played when, for
  advertiser-funded screens.
- **In-room TV** — addressed by room number via Chromecast for
  Hospitality; requires Samsung/LG hospitality TV partner stack.

## 5. Architecture

### Schema (one new migration)

```sql
-- supabase/migrations/<timestamp>_signage.sql

create table public.signage_screens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  space_id uuid references public.event_spaces(id) on delete set null,
  nickname text not null,
  -- Signed token embedded in /display/<token>. Rotatable via "unpair".
  player_token text not null unique,
  -- Optional pairing code, set during pair flow, cleared on bind.
  pairing_code text unique,
  pairing_code_expires_at timestamptz,
  last_heartbeat_at timestamptz,
  last_user_agent text,
  current_item_id uuid,
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
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index signage_playlists_default_per_property
  on public.signage_playlists(property_id) where is_default;

create type public.signage_item_kind as enum ('image', 'video', 'web', 'text');

create table public.signage_playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.signage_playlists(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind public.signage_item_kind not null,
  -- For image/video: R2 key. For web: URL. For text: JSON body.
  payload jsonb not null,
  duration_seconds integer not null default 8 check (duration_seconds between 2 and 600),
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
  -- Bitmask 0=Sun..6=Sat, null = every day
  days_of_week smallint[],
  -- 'HH:MM' strings, property local time
  start_time text,
  end_time text,
  priority integer not null default 0,
  created_at timestamptz not null default now()
);

create index signage_schedules_screen_idx on public.signage_schedules(screen_id);

-- RLS: standard org-scoped read; writes via service role.
alter table public.signage_screens enable row level security;
alter table public.signage_playlists enable row level security;
alter table public.signage_playlist_items enable row level security;
alter table public.signage_schedules enable row level security;

create policy signage_screens_select_org on public.signage_screens for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
create policy signage_playlists_select_org on public.signage_playlists for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
create policy signage_playlist_items_select_org on public.signage_playlist_items for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
create policy signage_schedules_select_org on public.signage_schedules for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
```

### Routes

```
src/app/(app)/signage/
  page.tsx                          screens dashboard
  screens/[id]/page.tsx             single screen detail + schedule editor
  screens/new/page.tsx              pair-a-screen flow (shows 6-digit code)
  playlists/page.tsx                playlist list
  playlists/[id]/page.tsx           playlist editor (drag-from-media-library)
  emergency/page.tsx                broadcast composer
  _actions.ts                       server actions (CRUD)
  _components/...

src/app/display/
  [token]/page.tsx                  the player (fullscreen, no chrome, no auth)
  pair/page.tsx                     code-entry form for unpaired devices

src/app/api/signage/
  heartbeat/route.ts                POST from player every 60s
  manifest/[token]/route.ts         GET current playlist + schedule + emergency state
  pair/route.ts                     POST { code } → returns screen_token
```

### Player implementation

A single React Server Component shell at `/display/[token]` renders:

```tsx
// pseudo
<html>
  <body class="bg-black overflow-hidden">
    <PlayerClient token={token} initialManifest={manifest} />
  </body>
</html>
```

`PlayerClient` is a `'use client'` component that:

1. Polls `/api/signage/manifest/[token]` every 60s (and immediately on
   `visibilitychange`).
2. Maintains a Service Worker (`/sw-signage.js`) that pre-caches the next 3
   playlist asset URLs. Asset URLs are `cdn.myhotelops.com/...` so cache
   hits don't touch our infra.
3. Cycles items via `setTimeout` per `duration_seconds`. Videos respect
   their own duration, capped at `duration_seconds`.
4. Posts heartbeat every 60s with current item id.
5. Renders emergency message as a fullscreen takeover when
   `emergency_until > now`.

Fire TV / Android TV reality: the stock Silk browser on Fire TV supports
Service Workers, autoplay video with audio muted, and fullscreen API. Set
the browser homepage to `display.myhotelops.com/<token>` and the device
boots straight into signage. No custom app required for v1. We can ship
a thin Android TV APK in v2 to remove the Silk browser intermediate step.

### Heartbeat & emergency override timing

- Heartbeat interval: 60s
- Manifest poll: 60s
- Emergency override: player polls a lightweight `/api/signage/emergency/[token]`
  every 5s with `If-None-Match`. Cached at the edge with `s-maxage=0,
  stale-while-revalidate=2`. Sub-5-second propagation, sub-cent monthly
  Vercel cost per screen.

### Existing-code reuse

| Need                              | Existing module                                              |
| --------------------------------- | ------------------------------------------------------------ |
| List R2 files for a property      | `src/lib/r2/list.ts` — already returns `MediaFile[]`         |
| Resolve CDN URL                   | `src/lib/r2/client.ts:r2PublicUrl`                           |
| Per-org cache tags                | `src/lib/media/cache-tags.ts`                                |
| Server-action auth                | `src/lib/auth/session.ts:requireSession`                     |
| Stripe metered billing            | `src/lib/stripe/subscriptions.ts` (extend with add-on Price) |
| Meeting room data for boards      | `event_spaces`, `event_schedule_blocks` tables               |
| Property timezone/locale          | `properties.country` (add `timezone` column in v1.1)         |
| Property logo for templates       | `properties.logo_key` (already exists)                       |

## 6. Hardware playbook

Documented at `/signage/help` after MVP:

| Tier            | Device                       | Cost     | Notes                                               |
| --------------- | ---------------------------- | -------- | --------------------------------------------------- |
| Default         | Fire TV Stick 4K (gen 2)     | ~$50     | Silk browser → kiosk URL; HDMI into any TV          |
| Higher-end      | Onn. Google TV 4K (Walmart)  | ~$20     | Chrome browser, slightly snappier video             |
| Existing TV     | Any smart TV with browser    | $0       | Tizen/webOS browsers vary; supported but not blessed|
| Touch/kiosk     | Amazon Fire HD 10 (v2 only)  | ~$140    | Wall-mounted with Fully Kiosk Browser license        |

**No proprietary player. No firmware to maintain. No hardware SKU to ship.**
This is the biggest cost-structure advantage over Mvix, Otrum, and Displai,
all of whom ship their own boxes.

## 7. Risks & mitigations

| Risk                                                                 | Mitigation                                                                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Customer points display at an iPhone-encoded HEVC video and it fails | Same handling as `/media` cover picker — surface MP4 H.264 requirement; v2 server-side transcode            |
| Operator pastes a malicious `<web>` URL                              | Iframe sandbox without `allow-scripts` `allow-same-origin`; warning copy in the picker; allowlist in v1.1   |
| Fire TV Silk browser regressions                                     | Document Onn. Google TV as fallback; ship native APK in v2                                                  |
| Screen offline, no one notices                                       | Email digest to org owner when any screen heartbeat is silent >24h                                          |
| Emergency takeover used as prank by staff                            | Require `org_owner` role to send emergency; audit log entry per send (reuse `event_activity` pattern)        |
| Bandwidth cost spike from a chatty property                          | R2→Cloudflare CDN egress is free; manifest API is cheap; quota only matters if we mis-architect             |
| Customer wants PMS data on screen before v2                          | "Send a CSV / Zapier webhook → posts to our manifest" escape hatch documented as a Pro-tier integration kit |

## 8. Go-to-market positioning

Tagline: **"The signage that comes with your hotel software."**

Sales bullets to put on the marketing page:

- Free for your first 3 screens — included in every HotelOps subscription.
- Flat $49/property/month for unlimited screens. No per-screen surprise bills.
- Plays from your existing photo library — no separate uploads.
- Meeting-room boards auto-fill from your event manager.
- Emergency broadcast: takeover every screen on property in one click.
- No proprietary hardware. Plug a $50 Fire TV Stick into any TV.

Comparison table for the landing page:

| For 6 screens at one property | Monthly cost      |
| ----------------------------- | ----------------- |
| **HotelOps Signage**          | **$0–$49**        |
| Yodeck Premium                | $66               |
| OptiSigns Pro                 | $75               |
| ScreenCloud Pro               | $180              |
| Otrum / Uniguest              | quote (typically $200+) |

## 9. Open questions (decide before kicking off)

1. Do we want signage as a separate Stripe Price (recommended — clean
   reporting), or roll it silently into the base $100 to remove the
   purchase decision entirely?
2. Should the 3 included screens be per-property or per-org? (Recommend
   per-property — matches existing pricing axis.)
3. Default playlist behaviour when none exists — black screen, property
   logo, or marketing default? (Recommend property logo on bg gradient.)
4. Player auth model — opaque token in URL is fine for MVP; do we want
   to add IP-pinning or device-fingerprinting in v2?
5. Templates: ship handcrafted defaults, or invest in a tenant-editable
   layout engine? (Recommend handcrafted in v1.1, layout engine deferred
   until customer demand is concrete.)

## 10. Rollout

- Week 1: schema + screens CRUD + pair flow + player skeleton
- Week 2: playlist editor + R2 picker reuse + scheduling
- Week 3: heartbeat + emergency override + Service Worker prefetch
- Week 4: Stripe wiring (add-on Price + included-3 logic) + admin tenant view
- Week 5: dogfood on a friendly tenant; bug bash; docs page
- Week 6: marketing page + comparison table + soft launch to existing tenants

v1.1 (weeks 7–10): multi-zone layouts, weather widget, meeting-room board
template, bulk push.
