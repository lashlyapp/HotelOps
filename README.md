# MyHotelOps

Multi-tenant operations stack for independent and boutique hotels. Self-serve signup with a 7-day free trial (no credit card), Stripe-billed per property after that. RLS-enforced multi-tenancy on Supabase; media on Cloudflare R2 behind `cdn.myhotelops.com`.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS v4
- **Supabase** — auth + Postgres (`@supabase/ssr`) with RLS-by-default
- **Cloudflare R2** — media storage, served from `cdn.myhotelops.com`
- **Resend** — transactional email (welcome emails to new members)
- **Vercel** — hosting

## Modules

**Public site** (`/`, `/features`, `/pricing`, `/blog`, `/about`, `/demo`, `/signup`, `/login`, `/proposal`, `/privacy`, `/terms`) — i18n'd across `en`, `es`, `fr`, `ja`, `ko`, `vi` (see `src/lib/i18n/dictionaries/`).

**Authenticated app** under `src/app/(app)/`:

| Path             | What it does                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard`     | Per-org overview: files, storage, recent invoices, per-property roll-up.                                                      |
| `/market`        | **Revenue Intelligence** — AI-native commercial copilot. Auto-detected market profile + comp set, daily executive briefing, demand-signal feed, and pricing recommendations. No analyst configuration required. |
| `/work-orders`   | Photo-first maintenance tickets on a Kanban board, time-stamped audit log.                                                    |
| `/events`        | Events & catering: inquiry → proposal → invoice in one place; branded PDFs.                                                   |
| `/signage`       | Browser-based digital signage. 3 screens in base; unlimited via the **Signage Unlimited** add-on.                             |
| `/arrival`       | Per-room QR / arrival page (Wi-Fi, room-service menus, brand). Part of the **Guest Experience** add-on surface.               |
| `/media`         | Media catalog: per-property tabs, search, type filter, lightbox, copy permanent CDN URL.                                      |
| `/social`        | **Social Studio** add-on — one AI-drafted post per property per day (caption, hashtags, photo from the catalog or Unsplash). No platform integrations; operator copies and posts from their phone. |
| `/it-hub`        | Wi-Fi credentials, vendor logins, equipment serials, warranty dates. Role-gated.                                              |
| `/properties`    | Tenant-owner CRUD on the org's properties.                                                                                    |
| `/team`          | Tenant-owner invites / removes staff. Welcome email via Resend.                                                               |
| `/billing`       | Invoice list, Stripe Customer Portal launcher, add-on toggles.                                                                |
| `/account`       | Profile, password change, sign out.                                                                                           |
| `/admin/**`      | Platform-admin only — list/manage tenants, force-start subscriptions, view per-tenant stats.                                  |

**Three-tier roles**: `platform_admin` (us) → `org_owner` (customer) → `org_staff`.

**Add-ons** (toggle on `/billing`, billed prorated; see `src/lib/stripe/addon-config.ts`):

- `signage_unlimited` — removes the 3-screen cap.
- `guest_experience` — unlocks the full arrival / guest-facing surface.
- `social_studio` — daily AI post drafts (gated by `hasAddon(org, 'social_studio')`).

## Self-serve signup

`/signup` collects email + name + hotel name + password, then emails a 6-digit OTP via Resend (`src/app/signup/actions.ts`). On verify, the flow atomically provisions org → first property → auth user → `org_owner` profile, then signs the user in to `/dashboard?welcome=trial`.

- **Trial:** 7 days, 10 GB per property, no credit card. Constants in `src/lib/billing/trial.ts`.
- **Bot protection:** honeypot field, per-IP and per-email rate limits backed by `tenant_signup_requests.created_at`, OTP as the final gate.
- **Attribution:** UTM params + referrer are captured on the landing page (`src/components/marketing/utm-capture.tsx`), persisted onto `signup_pending`, and carried forward to the `organizations` row.
- **Locale:** captured at form submit and stored on both `signup_pending` and the org so subsequent emails (OTP, welcome, T-3 trial reminder, T+0 expired) stay in the same language.

## Local development

1. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

   Fill in Supabase URL + keys, R2 credentials, and `NEXT_PUBLIC_SITE_URL` (use `http://localhost:3000` locally).

2. Apply the database schema. Two options:

   - **CI/CD (recommended):** push to GitHub. The `Database` workflow runs `supabase db push` against the linked remote project. Set the repo secrets listed under [CI / CD](#ci--cd).
   - **Manual one-time:** open Supabase Dashboard → SQL Editor and paste each file in `supabase/migrations/` in order.

3. Bootstrap the first platform admin (one-time, only needed if you also want to access `/admin`). Customers don't need this — they self-serve at `/signup`. Platform admins can manage every tenant from the admin portal:

   - **CI/CD (recommended):** add a temporary `BOOTSTRAP_ADMIN_PASSWORD` repo secret, then GitHub → Actions → **Bootstrap platform admin** → Run workflow → enter email (default `support@myhotelops.com`). Sign in at `/login`. After signing in, you may delete the secret.
   - **Local:**

     ```bash
     npm run bootstrap:admin -- \
       --email=support@myhotelops.com \
       --password=<strong-password>
     ```

   Platform admin emails must end in `@myhotelops.com`. Tenant/customer emails are unrestricted.

4. Create and manage tenants. Three paths:

   - **Self-serve (default)**: customer visits `/signup` and gets a 7-day trial. No platform-admin involvement.
   - **Platform admin** (`/admin`): lists every tenant; click a row to manage it (edit name, add/remove properties, add/remove members of any role, see per-property file/storage stats, force-start the subscription, delete tenant). Click **Create tenant** to provision an account directly (useful for white-glove onboarding).
   - **Tenant owner** (`/properties` and `/team`, visible to `org_owner` role only): manages their own properties and team members. When adding a member, choose either "let them set their own password" (sends a one-time setup link by email) or "set a temporary password" (share it manually).

   Anyone can change their own password from `/account`.

   Transactional email goes through Resend (signup OTP, trial welcome, T-3 trial reminder, T+0 trial expired, team invites). Set `RESEND_API_KEY` and `EMAIL_FROM` env vars (Vercel + `.env.local`). Without these, signup still provisions the account but emails are skipped (logged as warnings) — fine for local dev, broken for production. Verify your sending domain in Resend and use `noreply@myhotelops.com` as `EMAIL_FROM`.

4. Smoke-test R2 access:

   ```bash
   npx tsx scripts/smoke-r2.ts
   ```

5. Start the dev server:

   ```bash
   npm install
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Videos — R2 with auto-cover + post-upload picker

Videos (`video/mp4`, `video/quicktime`, `video/webm`) and images both live in R2 under the property prefix. The cover-image flow follows Facebook/Instagram: uploads never block on a modal.

1. **At upload time**, the drop-zone PUTs the video to R2 (single PUT under 10 MB, multipart above). As soon as it lands, an off-DOM `<video>` decodes the just-uploaded file (still in memory client-side), seeks to ~0.33s — the 10th frame at 30 fps, far enough in to skip the typical fade-from-black opener — and PUTs the captured JPEG as a sibling `_posters/{filename}.jpg`. This runs in the background; a batch of N videos isn't gated on N pickers.
2. **From the file's preview dialog**, the user can hit "Change cover" to open the frame picker (`src/app/(app)/media/_components/cover-picker.tsx`): an evenly-spaced thumbnail strip + scrubber, `crossOrigin="anonymous"` against the R2 origin so canvas reads aren't tainted. Confirming overwrites the same `_posters/{filename}.jpg` key; `media_metadata.updated_at` is appended as a `?v=` cache-buster on the public URL so the new cover appears immediately instead of waiting for the CDN edge to expire.

Playback uses a plain `<video src=…>` element with the poster set, so first paint is the cover frame instead of an empty player.

Why we don't use a transcoding service: Cloudflare Stream's $5 per 1000 minutes stored + $1 per 1000 minutes delivered scales linearly with the catalog forever. R2 is ~$0.015/GB-month with zero egress on the Cloudflare CDN, so a 60-second 720p H.264 MP4 (~30 MB) costs fractions of a cent.

**Codec note:** iPhone HEVC `.mov` files don't decode in non-Safari browsers. The cover picker detects the failure (metadata loads but `videoWidth === 0`) and surfaces an error asking the user to export as MP4 H.264 first. Adding a server-side transcode (Cloud Run / R2 event hook → ffmpeg) is the obvious next step if HEVC keeps showing up.

## R2 CORS — required for direct-to-R2 uploads

The drag-and-drop uploader has the browser PUT files directly to R2 (single PUT for files ≤10 MB, multipart upload for larger files — videos almost always take the multipart path). Without this, large originals would have to traverse the Vercel serverless function and hit the 4.5 MB body limit.

**The R2 bucket needs a CORS policy that allows the app origin to PUT and exposes the `ETag` header** (multipart uses the ETag of each uploaded part to finalize the upload).

The policy lives at [`infra/r2-cors.json`](infra/r2-cors.json) and is applied automatically by the [`R2 CORS`](.github/workflows/r2-cors.yml) GitHub Actions workflow on every push that touches the file. One-time setup: add repo secrets `CLOUDFLARE_API_TOKEN` (with "Workers R2 Storage:Edit" on the account) and `CLOUDFLARE_ACCOUNT_ID`. After that, edit `infra/r2-cors.json` and push — the workflow re-applies it. Manual dispatch is also available (Actions → **R2 CORS** → **Run workflow**) if you need to retarget a different bucket.

Each origin string supports a single `*` wildcard (S3-compatible), which is how the entry `https://hotel-ops-*.vercel.app` covers every branch's Vercel preview deployment. Add new production hostnames as literals. Without `exposeHeaders: ["ETag"]`, multipart uploads fail with "Cannot read ETag".

## R2 layout

A single `app-hotelops` bucket holds every tenant's media. Each tenant gets a top-level prefix matching its org slug; each property gets a sub-prefix:

```
app-hotelops/                       ← bucket (one for the entire platform)
  {org-slug}/
    {property-slug}/
      lobby-view-01.jpg
      ...
```

Each file is served from `https://cdn.myhotelops.com/{key}`. Filenames are humanized into descriptions on the fly (e.g. `lobby-view-01.jpg` → "Lobby View 01").

The bucket is configured with **public access enabled** and a custom domain bound to the platform CDN. New tenants don't require any R2 changes — the platform-admin "Create tenant" form (and the tenant-owner "Add property" form) compute the R2 prefix from the slugs you supply, and R2 creates folders lazily on first upload.

## Vercel Cron — scheduled cleanup

Schedules live in [`vercel.json`](vercel.json); routes live under `src/app/api/cron/`. Vercel calls each route on the configured schedule with `Authorization: Bearer ${CRON_SECRET}`; the handler rejects anything else.

| Schedule           | Route                         | Purpose                                                                                                                                           |
| ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0 4 * * *` UTC    | `/api/cron/orphan-posters`    | Delete `_posters/` JPEGs whose owning video is no longer in R2 — closes the leak when a delete fails between the video and poster object DELETEs. |
| `0 2 * * *` UTC    | `/api/cron/billing-reconcile` | Reconcile Stripe subscription / invoice state onto local org rows; recovers from missed webhooks.                                                 |
| `30 3 * * *` UTC   | `/api/cron/storage-usage`     | Recompute per-property storage usage from R2 so the dashboard / quota gates don't drift.                                                          |
| `0 * * * *` UTC    | `/api/cron/trial-expiry`      | Hourly sweep: fire T-3 reminder emails, lock orgs at T+0, surface the recovery banner.                                                            |
| `0 13 * * *` UTC   | `/api/cron/blog-publishing`   | Promote scheduled blog posts whose `published_at` has passed.                                                                                     |
| `0 11 * * *` UTC   | `/api/cron/social-daily-posts`| Generate the daily Social Studio draft (caption + hashtags + photo pick) for every property whose org has the `social_studio` add-on.            |

Set `CRON_SECRET` (any high-entropy string — `openssl rand -base64 32`) as a Vercel project env var; copy the same value into `.env.local` if you want to hit the route locally for testing (`curl -H "Authorization: Bearer …" http://localhost:3000/api/cron/orphan-posters`).

## Tenant model

- **organizations** — top-level tenant. Slug, name, locale, currency, trial window, Stripe customer + subscription ids, add-on active flags, UTM attribution.
- **profiles** — 1:1 with `auth.users`; each profile belongs to one org. Roles: `platform_admin`, `org_owner`, `org_staff`.
- **properties** — hotels owned by an org. `r2_prefix` maps to a folder; `storage_quota_bytes` enforced at upload time.
- **invoices** — mirrored from Stripe; the `/billing` UI reads from this table, not Stripe directly.
- **signup_pending** / **tenant_signup_requests** — pre-OTP staging + audit trail for self-serve signup.
- Module tables: `work_orders`, `events`, `signage_*`, `arrival_*`, `media_metadata`, `social_post_log`, `social_caption_feedback`, `property_social_settings`, `it_hub_*`.

RLS is enabled on every table; org members can only read their own org's rows. Writes that cross org boundaries (signup, admin tools, webhook handlers, cron jobs) go through the service-role client (`src/lib/supabase/admin.ts`), which bypasses RLS.

## Project layout

```
src/
  app/
    page.tsx                       Landing page (i18n'd, UTM-capturing)
    features/                      Full feature catalog (FeatureGrid)
    pricing/                       Pricing page + FAQ
    blog/                          MDX-ish blog with scheduled publishing
    about/, demo/, proposal/       Marketing surface
    signup/                        Self-serve signup + OTP verify
    login/, forgot-password/, set-password/, auth/callback/
    (app)/                         Authenticated app shell (sidebar layout)
      dashboard/, work-orders/, events/, signage/, arrival/,
      media/, social/, it-hub/, properties/, team/, billing/, account/
    (admin)/                       Platform-admin pages (/admin/**)
    api/
      stripe/webhook/              Stripe event ingestion
      cron/                        Vercel cron handlers (see table above)
  components/
    brand/, layout/, ui/           Wordmark, header/footer, primitives
    marketing/                     FeatureGrid, FeaturesDropdown, UtmCapture, etc.
  lib/
    auth/                          Session helpers, password policy, OTP
    billing/                       Trial state machine, addon gating, currency
    stripe/                        Customer/subscription/addon clients + prices
    crypto/                        AES helpers (used to stage signup passwords)
    email/                         Resend wrappers + templates
    i18n/                          Dictionaries (en/es/fr/ja/ko/vi) + locale resolver
    r2/                            R2 client, listing, stats
    supabase/                      Browser/server/admin clients + generated types
    media/, utils/, brand.ts
  proxy.ts                         Edge proxy refreshing Supabase sessions
docs/design-system.md              Token reference + component conventions
supabase/migrations/               Append-only, timestamp-prefixed
scripts/
  bootstrap-admin.ts               Create the first platform_admin
  smoke-r2.ts                      Quick R2 connectivity check
.github/workflows/                 ci.yml, database.yml, bootstrap-admin.yml, r2-cors.yml
```

## Design system

See [`docs/design-system.md`](docs/design-system.md). TL;DR: every color in markup is semantic (`bg-surface`, `text-muted`), never raw (`bg-zinc-100`). Tokens live in `src/app/globals.css`. Rebrand by editing the `:root` CSS variables.

## CI / CD

- **App CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint + `next build` on every push and PR. Uses placeholder env vars; no secrets required.

- **Database migrations (auto):** [`.github/workflows/database.yml`](.github/workflows/database.yml) runs Supabase migrations on every push (feature branches and merges to `main`) plus manual dispatch. Idempotent — Supabase CLI tracks applied migrations in `supabase_migrations.schema_migrations`.

- **Tenant onboarding & subscription start:** done from the **admin portal**
  (`/admin` → "New tenant" form, then `/admin/tenants/<id>` → "Start
  subscription"). No GitHub workflow needed — both actions are platform-admin
  server actions guarded by `requirePlatformAdmin()`. The first platform
  admin is bootstrapped via [`.github/workflows/bootstrap-admin.yml`](.github/workflows/bootstrap-admin.yml)
  (chicken-and-egg: no admin exists yet to use the UI).

  Required GitHub repo secrets (Settings → Secrets and variables → Actions):

  | Secret                       | Used by                | Where to get it                                                                |
  | ---------------------------- | ---------------------- | ------------------------------------------------------------------------------ |
  | `SUPABASE_ACCESS_TOKEN`      | migrations             | https://supabase.com/dashboard/account/tokens                                  |
  | `SUPABASE_PROJECT_REF`       | migrations             | `ebhrldafznxsepqcpcjx`                                                         |
  | `SUPABASE_DB_PASSWORD`       | migrations             | Supabase Dashboard → Settings → Database                                       |
  | `SUPABASE_URL`               | bootstrap-admin        | `https://ebhrldafznxsepqcpcjx.supabase.co`                                     |
  | `SUPABASE_SERVICE_ROLE_KEY`  | bootstrap-admin        | Supabase Dashboard → Settings → API → `service_role`                           |
  | `SITE_URL`                   | bootstrap-admin        | Production / preview URL for invite-email redirects                            |

- **CD (Vercel):**
  1. In Vercel, **Import Project** → select the GitHub repo `lashlyapp/HotelOps`.
  2. Set Environment Variables (Production + Preview) to match `.env.example`. Set `NEXT_PUBLIC_SITE_URL` to the deployed URL (e.g. `https://www.myhotelops.com`).
  3. In Supabase → Authentication → URL Configuration, add the production URL + `/auth/callback` to the allowed redirect URLs.
  4. Pushes to `main` deploy to Production; PRs get Preview deployments automatically.
  5. **Region:** the Supabase project is in `us-east-2` (Ohio). The closest
     Vercel Function region is `iad1` (Washington DC) — also Vercel's
     default, so most projects don't need to change anything. Confirm at
     Vercel → Project → Settings → Functions → Function Region. Avoid
     `sfo1` / `pdx1` / non-US regions: cross-coast adds ~60ms per round-
     trip, and with 4 queries per render that compounds quickly.

## Scripts

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — lint
- `npm run bootstrap:admin -- --email=... --password=...` — create the first platform admin (one-time; after that, everything tenant-side is on `/admin`)
- `npx tsx scripts/smoke-r2.ts` — R2 connectivity smoke test

## Stripe billing

HotelOps uses its own Stripe account (separate from Lashly). Each organization
maps 1:1 to a Stripe Customer + Subscription. Pricing is **$100/property/month**
(subscription quantity = property count) plus an optional **$150 per
property onboarding fee** (1-on-1 setup with our client consultant) on
the first invoice — only charged when the org opts in at signup. Add-ons (Signage Unlimited, Guest Experience, Social Studio)
are extra subscription items keyed by `Price.lookup_key` so prices can be
rotated without code changes.

Every subscription is created on `collection_method=charge_automatically` with
a payment method already on file. There is no `send_invoice` fallback —
without a card we don't start a subscription. Two onboarding paths converge on
that same model:

**Self-serve trial (default).** `/signup` provisions the org with a 7-day
trial, no Stripe customer yet. The trial-state machine in
`src/lib/billing/trial.ts` gates write access at T+0. The customer converts
from `/billing` → "Start & add card", which opens Stripe Checkout in
subscription mode: card is collected, Customer + Subscription are created, and
the setup fee (if it's the org's first property) lands on the first invoice
which Stripe charges immediately.

**Admin-started subscription.** From `/admin/tenants/<id>` → "Start
subscription", `src/lib/stripe/start-subscription.ts` creates the Customer +
Subscription using the org's designated auto-pay default card. If the org has
no auto-pay default on file, the action refuses with an actionable message and
the admin routes the customer through self-serve Checkout instead.

For an existing past_due subscription, `/billing` → "Update card" opens
setup-mode Checkout; the webhook attaches the new card to the subscription
and pays any open invoice with it.

Customers manage their billing at `/billing` → "Manage billing", which opens
the Stripe Billing Portal (update card, view invoices, cancel). Add-ons can
be toggled on the same page (`src/app/(app)/billing/_components/addon-toggle.tsx`),
billed prorated.

### Setup

1. Create a separate Stripe account for HotelOps (sole-prop is fine to start).
2. Create the recurring per-property Price ($100/mo) in the Dashboard and
   assign it the lookup key `hotelops_per_property_monthly`. Optionally
   create a one-time Price for the setup fee with lookup key
   `hotelops_setup_fee`. The app resolves these to actual Price ids at
   runtime, so updating pricing only requires creating a new Price and
   transferring the lookup key onto it (`transfer_lookup_key=true`) — no
   redeploy, no env changes, existing subscriptions stay on their
   grandfathered Price.
3. Configure the webhook endpoint at `https://www.myhotelops.com/api/stripe/webhook`
   with these events: `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `customer.subscription.paused`, `customer.subscription.resumed`,
   `checkout.session.completed`. Copy the signing secret into
   `STRIPE_WEBHOOK_SECRET`.
4. Enable the Customer Portal under Dashboard → Settings → Billing → Customer
   portal (allow card updates and cancellation; invoice history is on by default).
5. For local dev, run `stripe listen --forward-to localhost:3000/api/stripe/webhook`
   and use the printed `whsec_...` as `STRIPE_WEBHOOK_SECRET`.

### Starting a tenant's subscription

Once the Stripe account, Prices, and webhook are configured and the migration
has been applied: from the admin portal, open `/admin/tenants/<org-id>` and
click **Start subscription**. The action auto-detects the property count,
creates the Stripe Customer + Subscription with the 14-day grace window, and
adds the setup fee to the first invoice. Idempotent — clicking again on an
org that already has a non-terminal subscription is a no-op.

## Roadmap

Shipped beyond initial v1: work orders, events & catering, signage, arrival, social studio, IT hub, self-serve signup with trial, Stripe add-ons, 6-locale i18n. Still on the list: reservations, housekeeping, staff scheduling, multi-org users / staff invitations, owner-editable file descriptions, automatic publishing for Social Studio (currently copy-and-paste by design).
