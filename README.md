# MyHotelOps

Multi-tenant SaaS for hotel property owners. v1 ships a centralized media library with permanent CDN URLs, plus check-payment billing. Auth is invite-only, RLS-enforced.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS v4
- **Supabase** — auth + Postgres (`@supabase/ssr`) with RLS-by-default
- **Cloudflare R2** — media storage, served from `cdn.myhotelops.com`
- **Resend** — transactional email (welcome emails to new members)
- **Vercel** — hosting

## Features (v1)

- **Public landing page** at `/`
- **Three-tier roles**: platform admin (us) → tenant owner (customer) → tenant staff
- **Admin portal** (`/admin`) — list tenants, create new tenants with initial owner credentials
- **Tenant portal** (`/dashboard`, `/media`, `/billing`, `/team`, `/account`) — owner manages their team; staff can browse the catalog
- **Dashboard** — per-org overview: total files, storage used, last upload, open invoices, per-property breakdown, recent invoices
- **Media catalog** — per-property tabs, search, type filter, click-to-preview lightbox, copy permanent URL
- **Library stats** — file count, storage used, breakdown by type, last updated
- **Billing** — invoice list with check-payment instructions
- **Account** — profile, role, change password, sign out
- **Design system foundation** — semantic tokens, primitives, brand wordmark, footer

## Local development

1. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

   Fill in Supabase URL + keys, R2 credentials, and `NEXT_PUBLIC_SITE_URL` (use `http://localhost:3000` locally).

2. Apply the database schema. Two options:

   - **CI/CD (recommended):** push to GitHub. The `Database` workflow runs `supabase db push` against the linked remote project. Set the repo secrets listed under [CI / CD](#ci--cd).
   - **Manual one-time:** open Supabase Dashboard → SQL Editor and paste the contents of the latest file in `supabase/migrations/`.

3. Bootstrap the first platform admin (one-time). They can then manage every tenant from the UI:

   - **CI/CD (recommended):** add a temporary `BOOTSTRAP_ADMIN_PASSWORD` repo secret, then GitHub → Actions → **Bootstrap platform admin** → Run workflow → enter email (default `support@myhotelops.com`). Sign in at `/login`. After signing in, you may delete the secret.
   - **Local:**

     ```bash
     npm run bootstrap:admin -- \
       --email=support@myhotelops.com \
       --password=<strong-password>
     ```

   Platform admin emails must end in `@myhotelops.com`. Tenant/customer emails are unrestricted.

4. Create and manage tenants from the UI:

   - **Platform admin** (`/admin`): lists every tenant on the platform; click a row to manage it (edit name, add/remove properties, add/remove members of any role, see per-property file/storage stats, delete tenant). Click **Create tenant** to onboard a new customer with org name, slug, properties, and initial owner credentials.
   - **Tenant owner** (`/properties` and `/team`, visible to `org_owner` role only): manages their own properties and team members. When adding a member, choose either "let them set their own password" (sends a one-time setup link by email) or "set a temporary password" (share it manually).
   - **Anyone**: change their own password from `/account`.

   Welcome emails go through Resend. Set `RESEND_API_KEY` and `EMAIL_FROM` env vars (Vercel + `.env.local`). Without these, member creation still works but the email is skipped (logged as a warning). For production, verify your sending domain in Resend and use `noreply@myhotelops.com` as `EMAIL_FROM`.

   The `Onboard tenant` GitHub Actions workflow remains as an ops fallback for non-UI provisioning.

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

| Schedule        | Route                       | Purpose                                                                                                                                           |
| --------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0 4 * * *` UTC | `/api/cron/orphan-posters`  | Delete `_posters/` JPEGs whose owning video is no longer in R2 — closes the leak when a delete fails between the video and poster object DELETEs. |

Set `CRON_SECRET` (any high-entropy string — `openssl rand -base64 32`) as a Vercel project env var; copy the same value into `.env.local` if you want to hit the route locally for testing (`curl -H "Authorization: Bearer …" http://localhost:3000/api/cron/orphan-posters`).

## Tenant model

- **organizations** — top-level tenant. Slug, name.
- **profiles** — 1:1 with `auth.users`; each profile belongs to one org. Roles: `platform_admin`, `org_owner`, `org_staff`.
- **properties** — hotels owned by an org. `r2_prefix` maps to a folder.
- **invoices** — offline (check) billing.

RLS is enabled on every table; org members can only read their own org's rows. Writes happen via the service role (which bypasses RLS) in admin scripts.

## Project layout

```
src/
  app/
    page.tsx                  Marketing landing page (public)
    login/                    Sign in (server actions)
    set-password/             Post-invite password setup
    auth/callback/            Supabase magic-link redirect handler
    (app)/                    Authenticated app (sidebar layout)
      media/                  Catalog: stats, search, preview, copy URL
      billing/                Invoice list + payment instructions
      account/                Profile + sign out
  components/
    brand/wordmark.tsx        MyHotelOps wordmark lockup
    layout/footer.tsx         Public + app footer variants
    ui/                       Button, Input, Label, Card, Badge
  lib/
    auth/session.ts           requireSession() helper
    brand.ts                  Brand strings (legal name, address, support)
    media/humanize.ts         filename → human description
    r2/                       R2 client, listing, stats
    supabase/                 Browser/server/admin clients + types
    utils/cn.ts               className helper
  proxy.ts                    Edge proxy refreshing Supabase sessions
docs/
  design-system.md            Token reference + component conventions
supabase/migrations/0001_init.sql
scripts/
  setup.ts                    Seed org + properties + invite owner
  smoke-r2.ts                 Quick R2 connectivity check
.github/workflows/ci.yml      Lint + build on every push / PR
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
  5. **Region:** the Supabase project is in `us-west-1`. Set the Vercel project's primary region to `sfo1` (San Francisco, us-west) to match. Cross-region Vercel↔Supabase adds ~70ms per round-trip; same-region is 5–10ms. With 4 queries per render (auth + profile + org + sub), that's ~250ms saved per navigation. Vercel → Project → Settings → Functions → Function Region.

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
(subscription quantity = property count) plus a one-time **$250 setup fee** on
the first invoice. The flow:

1. **Admin starts the subscription** from `/admin/tenants/<id>` → "Start
   subscription". This creates the Stripe Customer and a per-property
   Subscription billed via `collection_method=send_invoice` with a 14-day
   grace window (`days_until_due=14`). The first invoice — including the
   setup fee — is issued immediately and listed under `/billing`. No
   payment method is required up front.
2. **Customer saves a card for auto-renewal** during the 14-day window via
   `/billing` → "Save card for auto-renewal". The CTA opens Stripe Checkout in
   `setup` mode; the webhook attaches the card to the customer + subscription
   and flips collection from `send_invoice` to `charge_automatically` so
   future monthly invoices auto-charge. The first invoice stays open for the
   customer to pay through their preferred channel.
3. **Cooling period passes without a card:** Stripe transitions the open
   invoice (and the subscription) to `past_due`, and the billing page surfaces
   a recovery message.
4. **Customer manages billing** at `/billing` → "Manage billing", which opens
   the Stripe Billing Portal (update card, view invoices, cancel).

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

Modules planned beyond v1: reservations, housekeeping, staff scheduling, multi-org users / staff invitations, owner-editable file descriptions, AI-assisted captioning.
