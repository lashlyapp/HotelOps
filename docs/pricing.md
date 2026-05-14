# Pricing

Status: **locked** — May 2026

Canonical source for HotelOps pricing. Specs and marketing copy point at
this doc; never hardcode prices anywhere else. Stripe Price ids resolve
at runtime from the lookup keys listed below — pricing changes happen in
the Stripe Dashboard (create a new Price, transfer the lookup key), not
in this file.

## Plan

One base subscription plus two optional add-ons. All three line items
bill **per property per month** — the same axis the rest of the platform
already uses. No per-screen, per-room, or per-seat metering.

**Add-ons activate at the organization level**, not per-property. When
an owner toggles an add-on on, every property in the org receives the
matching Stripe SubscriptionItem and every property's monthly invoice
includes that line. New properties added later inherit the active
add-ons automatically. This closes the loophole where attaching the
add-on to a single property would unlock the feature across the
portfolio while billing for only one.

| Line item | Price | Stripe lookup key | What it unlocks |
| --- | --- | --- | --- |
| **Base** | **$100 / property / month** | `hotelops_per_property_monthly` | Everything not listed below |
| **Signage Unlimited** add-on | **+$49 / property / month** | `hotelops_signage_unlimited_monthly` | Unlimited screens beyond the 3 included in base |
| **Guest Experience** add-on | **+$39 / property / month** | `hotelops_guest_experience_monthly` | Arrival pages, printable QR cards, guest room-issue intake |
| Signage overage *(no add-on)* | $5 / screen / month | `hotelops_signage_overage_per_screen_monthly` | Per-screen charge for properties without the unlimited add-on, beyond the 3 included |
| One-time setup fee *(optional)* | configured per tenant | `hotelops_setup_fee` | Onboarding labor, white-glove provisioning |

Max ARPU at full add-on attach: **$188 / property / month**.

## Base — $100 / property / month

Everything in the base. No feature is held back by user count or storage
tier; the only metering is the property count itself.

- **Media catalog** — R2-backed asset library with the zero-egress
  Cloudflare CDN. Unlimited files, no per-GB charge.
- **Events** — full inquiry → proposal → invoice pipeline with line
  items, schedule blocks, spaces, payments, activity log.
- **Tasks** — Kanban board with photo and video evidence, comments,
  activity timeline, owner-override "Mark done". Recurring/PM
  templates, SLA timers, vendor magic-link portal, and parts/cost
  ledger land in this tier as they ship (Tasks v1.1).
- **IT Hub** — Wi-Fi, vendor logins, equipment register, IT vendor
  directory, and a per-org document repository.
- **Signage starter** — **3 screens included** per property. Operator UI
  plus the public player at `tv.myhotelops.com`. Property-wide
  emergency broadcast included.
- **Dashboard, Team, Properties, Billing, Account** — the app shell.

## Signage Unlimited — +$49 / property / month

For properties with more than 3 screens. Flat per property regardless
of screen count.

Includes:
- Unlimited screens (vs. 3 included in base)
- Property-wide emergency broadcast (also in base)
- Future: multi-zone layouts, meeting-room boards driven by
  `event_schedule_blocks`, PMS-driven welcome screens

Break-even vs. Yodeck/OptiSigns at 6 screens; dominant past 7. R2 + CDN
egress is free, so marginal cost is sub-$1/property/month.

The no-add-on path uses the `hotelops_signage_overage_per_screen_monthly`
Price at **$5/screen/month** for screens beyond the 3 included — that's
slightly punitive vs. the flat $49 (e.g. 6 extra screens = $30 metered vs.
$49 flat) which nudges customers into the add-on naturally past 4 screens.

## Guest Experience — +$39 / property / month

For hotels that want the in-room QR card + arrival page + guest issue
reporting. Flat per property regardless of room count.

Includes:
- **Arrival page builder** — Wi-Fi auto-import from IT Hub, welcome
  copy, dining hours, menus, marketing banners, quick-info pairs,
  brand color
- **Printable QR card** — letter / A4 layout with property logo, QR
  code, short URL, Room # blank
- **Guest issue intake** *(roadmap)* — per-room sticker links to a
  pre-filled task report; guest snaps a photo, creates a task

Beats Duve/Canary's $3–$6 per occupied room — a 40-room property pays
$39 here vs. ~$160 there.

## What's intentionally *not* charged for

Listed so we stop talking ourselves into adding fees:

- **Storage / bandwidth** — R2 plus Cloudflare CDN is effectively free
  at our scale; metering it wrecks the simplicity story
- **Per-user seats** — punishes the lean operators we want most
- **IT Hub access** — glue feature, not a profit center
- **Tasks attachments / activity history** — the wedge feature; gating
  it loses the hook
- **API usage** — no API exposed yet; when it ships, it's per-property,
  not per-call

## Volume discounts

Not yet. The clean per-property unit price is the marketing weapon —
discounting it ad-hoc dilutes the comparison table. When a chain
opportunity warrants it, propose a custom annual contract via Stripe
quote, not a published volume tier.

## Comparison table for marketing

For a 40-room boutique hotel, à la carte cost of the standalone tools
HotelOps replaces:

| Need | Standalone | HotelOps |
| --- | --- | --- |
| Maintenance + ticketing | $130 / mo (Quore) | included |
| Event / banquet management | $150 / mo (Tripleseat) | included |
| Media DAM | $50 / mo (Cloudinary) | included |
| IT inventory + password vault | $30 / mo | included |
| Digital signage (6 screens) | $60 / mo (Yodeck) | $49 / mo |
| Guest arrival / concierge | $160 / mo (Duve $4/room) | $39 / mo |
| **Monthly total** | **$580** | **$188** |
| **Savings** | | **$392 / mo (68%)** |

Customer who only wants the base: ~$360 of competing tools for $100.

## Operational

1. Create the Stripe Prices once per environment (test, live):
   - `hotelops_per_property_monthly` — $100 recurring, USD, monthly
   - `hotelops_signage_unlimited_monthly` — $49 recurring, USD, monthly
   - `hotelops_signage_overage_per_screen_monthly` — $5 recurring, USD,
     monthly
   - `hotelops_guest_experience_monthly` — $39 recurring, USD, monthly
   - `hotelops_setup_fee` — one-time, USD, configured per-tenant amount
2. The lookup keys are referenced from `src/lib/stripe/prices.ts`.
3. Subscription quantity is always the property count (the existing
   per-property pattern in `src/lib/stripe/start-subscription.ts`).
4. To raise prices later, create a new Price in Stripe with
   `transfer_lookup_key: true` and the same lookup key string. Existing
   subscriptions stay grandfathered; new subscriptions pick up the new
   amount automatically.
