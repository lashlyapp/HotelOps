# Pricing

Status: **locked** — May 2026

Canonical source for HotelOps pricing. Specs and marketing copy point at
this doc; never hardcode prices anywhere else. Stripe Price ids resolve
at runtime from the lookup keys listed below — pricing changes happen in
the Stripe Dashboard (create a new Price, transfer the lookup key), not
in this file.

## Positioning

**We are not your PMS.** We sit alongside Cloudbeds, Mews, Opera, Little
Hotelier, and every other reservation system, and we handle the
operational surfaces those tools leave to spreadsheets and group chats:
maintenance work orders, event proposals, vendor logins, signage on
every TV, the printable arrival card in every room.

**Buyer:** owners, GMs, and operations managers of boutique hotels
(roughly 10–100 rooms, independent or small group). Not line staff
fighting the reservation system — the people who live *outside* the
PMS, in the operational chaos around it.

**Why this positioning matters for pricing:**
- We don't compete head-on with PMS-led suites that bundle reservation
  + everything else. That comparison always loses.
- We compete with the *stack of 4–5 separate tools* a boutique uses
  on top of their PMS today. That comparison wins on price and
  cognitive load.
- The flat per-property number lands cleanly because owners think in
  properties, not in seats / rooms / screens.

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

## Free trial (self-serve)

Anyone with a work email can sign up at `/signup` and get a 7-day, no-
credit-card, 10 GB trial. Length, storage cap, and seat limit live in
`src/lib/billing/trial.ts` and `ownerAddPropertyAction` — change them
without a migration. The trial is an acquisition surface, not a
pricing tier: there is no public "free plan".

What the trial includes:

- **7 days** of full access — same feature set as paid base plan.
- **1 property** — adding a second is blocked by
  `ownerAddPropertyAction` until a payment method is on file.
- **10 GB** of media on that property — same storage plumbing as paid
  (`properties.storage_quota_bytes`); on conversion the quota is
  lifted to 25 GB by `startSubscriptionForProperty`.
- **All the base-plan features** — Media catalog, Events, Work
  orders, IT Hub, Signage starter, Arrival. Add-ons are toggled off
  by default; turning them on requires a paid subscription.

Bot protection:

- Honeypot field on the form.
- Per-IP / per-email rate limit (5 / 3 per 15 minutes).
- Mandatory **6-digit email OTP** before the auth user / org are
  created — a bot that can't read email cannot finish signup.
- Account-takeover guard: refuses signups for emails that already
  have an auth user.
- Password held AES-256-GCM-encrypted in `signup_pending` between OTP
  request and verification (key from `SIGNUP_ENCRYPTION_KEY`). The
  row is deleted the moment the auth user is created.

Lifecycle emails (sent by `/api/cron/trial-expiry`, hourly):

- **Welcome** — the instant verification succeeds. Dashboard CTA + an
  unauthenticated link back in case the user closes the tab.
- **T-3 days** — soft nudge. Stamps `trial_reminder_t3_sent_at`.
- **T+0 expiry** — "your data is safe, add a card to keep editing".
  Stamps `trial_expired_email_sent_at`. The org flips to read-only at
  the same moment via the billing gate.

Conversion is the same flow as any other "Start subscription" — there
is no separate trial→paid endpoint. When `startSubscriptionForProperty`
creates the org's first subscription it also stamps
`organizations.trial_converted_at` (which the admin dashboard reads
to compute conversion rate) and bumps the property's storage quota
from 10 GB to the 25 GB base.

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

## Multi-currency

`organizations.currency` is set at signup from the visitor's locale
(en → USD, es/fr → EUR, with more locales mapping into the table as
we localize the marketing site). The column is immutable once set —
switching currency mid-stream on a Stripe Customer is awkward enough
that we treat it as a manual-ops escape hatch, not a customer-facing
control.

**Per-currency Stripe Prices.** USD keeps the bare lookup keys
(`hotelops_per_property_monthly`, etc.) so existing US customers are
not migrated. Each new currency gets a parallel set of Prices in the
same Stripe account, with lookup keys suffixed by the lowercase ISO
code:

| Currency | Base lookup key                                |
| -------- | ---------------------------------------------- |
| USD      | `hotelops_per_property_monthly`                |
| EUR      | `hotelops_per_property_monthly_eur`            |
| GBP      | `hotelops_per_property_monthly_gbp`            |
| MXN      | `hotelops_per_property_monthly_mxn`            |
| AUD      | `hotelops_per_property_monthly_aud`            |

The same `_<code>` suffix applies to every Price in the family:
`hotelops_setup_fee_eur`, `hotelops_signage_unlimited_monthly_eur`,
`hotelops_guest_experience_monthly_eur`,
`hotelops_signage_overage_per_screen_monthly_eur`,
`hotelops_storage_block_25gb_monthly_eur`. Resolution is handled by
`currencyAwareLookupKey()` in `src/lib/billing/currency.ts` — the
codebase reads the org's currency once on the way into Stripe and
every downstream Price lookup picks the right one automatically.

**Operator workflow to launch a new market** (e.g. add GBP):
1. In Stripe Dashboard, create one Price per family in the new
   currency with the suffixed lookup key. Use realistic local
   pricing (£89 not £100; €99 not €100) — the goal is "reads as
   cheap" not "fx-converted exactly".
2. Add the currency code to `SUPPORTED_CURRENCIES` in
   `src/lib/billing/currency.ts` AND the CHECK constraint in
   `supabase/migrations/<next>_org_currency_<code>.sql`. Both in
   the same PR.
3. Update the `LOCALE_TO_CURRENCY` map if a marketing locale should
   default to the new currency.

No existing customer is affected. New signups with the
matching locale land on the new currency; everyone else continues
on whatever currency they signed up under.

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

## Background reconciliation

Billing state lives in two places: Stripe (source of truth) and our
`billing_subscriptions` table (mirror). Three independent paths keep
the mirror honest:

1. **Stripe webhook** — primary. Fires within seconds of any
   `customer.subscription.*` event. Implemented in
   `src/app/api/stripe/webhook/route.ts` → `syncSubscriptionToDb`.
2. **Post-login reconcile** — fires after the login response goes out
   via Next's `after()`. Implemented in `src/app/login/actions.ts` →
   `reconcileOrgSubscriptions`. Catches anything the webhook missed
   before the user reaches `/billing` on their next session. Zero
   added login latency.
3. **Nightly cron** — `/api/cron/billing-reconcile`, scheduled at
   **02:00 UTC daily** in `vercel.json`. Last line of defense. Walks
   every org with a Stripe customer and runs the same reconciler.

### Why three paths?

Each one fixes a failure mode the next can't cover on its own:

- **Webhook alone** isn't enough because Stripe doesn't guarantee
  delivery indefinitely (it gives up after several days of retries),
  and our schema or code can race a webhook (we hit this once already
  with the legacy `UNIQUE(stripe_customer_id)` constraint).
- **Login reconcile alone** isn't enough for orgs whose owner is
  inactive for a stretch while staff are still operating the property
  — a missed webhook + a new property added by staff would mean
  incorrect invoices until the owner returns.
- **Cron alone** would mean up to 24 hours of wrong state on `/billing`,
  which erodes trust the moment an operator sees stale numbers.

### Why nightly, not hourly?

Hourly was overkill once the login reconcile shipped — the login path
handles the common case (active user, mid-day deploy, fresh property),
and the cron only needs to cover the genuinely-stale-account scenario.
Daily at 02:00 UTC keeps the safety net while doing meaningful work
only when something is actually broken — the reconciler fast-paths to
a no-op in the steady state. A nightly run also produces one log line
per day per org (`reconciler: scanned N, healed 0`) which is decent
evidence-of-correctness without flooding logs.

### What the reconciler does

`src/lib/stripe/reconcile.ts:reconcileOrgSubscriptions(orgId, customerId)`:

1. Fast-path: counts properties vs. mirrored subs + compares each
   `billing_subscriptions.<addon>_active` to `organizations.<addon>_addon_active`.
   Returns immediately if everything matches (no Stripe call).
2. Slow path: lists every Subscription on the org's Stripe Customer.
3. For each Stripe sub, resolves the matching property by metadata,
   then slug, then `description` fallback. Heals
   `subscription.metadata` in place if it was stale.
4. Re-mirrors via `syncSubscriptionToDb` so the local row matches Stripe.
5. **Second pass**: for each (property, addon) pair, makes Stripe's
   SubscriptionItem state match the org-level flag — adds items if the
   flag is on but they're missing, removes them if the flag is off
   but they exist. Both with `proration_behavior: 'create_prorations'`.

### How to verify it's working

- Vercel → Project → Logs → filter for `/api/cron/billing-reconcile`
  to see the daily run. Healthy response is `{ ok: true, scanned: N,
  failures: [] }`.
- Vercel → Project → Logs → filter for `[billing] reconcile:` for any
  failure detail (per-org messages, never abort the whole pass).
- To force a run manually, call the route with the cron secret:
  `curl -H "Authorization: Bearer $CRON_SECRET"
   https://app.myhotelops.com/api/cron/billing-reconcile`.
