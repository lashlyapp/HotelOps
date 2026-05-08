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

- **Tenant onboarding (manual):** [`.github/workflows/onboard-tenant.yml`](.github/workflows/onboard-tenant.yml) runs only via **Run workflow** with form inputs (org slug, name, owner email, properties). Use this every time you onboard a new customer; not tied to any particular tenant.

  Required GitHub repo secrets (Settings → Secrets and variables → Actions):

  | Secret                       | Used by                | Where to get it                                                                |
  | ---------------------------- | ---------------------- | ------------------------------------------------------------------------------ |
  | `SUPABASE_ACCESS_TOKEN`      | migrations             | https://supabase.com/dashboard/account/tokens                                  |
  | `SUPABASE_PROJECT_REF`       | migrations             | `ebhrldafznxsepqcpcjx`                                                         |
  | `SUPABASE_DB_PASSWORD`       | migrations             | Supabase Dashboard → Settings → Database                                       |
  | `SUPABASE_URL`               | onboarding             | `https://ebhrldafznxsepqcpcjx.supabase.co`                                     |
  | `SUPABASE_SERVICE_ROLE_KEY`  | onboarding             | Supabase Dashboard → Settings → API → `service_role`                           |
  | `SITE_URL`                   | onboarding             | Production / preview URL for invite-email redirects                            |

- **CD (Vercel):**
  1. In Vercel, **Import Project** → select the GitHub repo `lashlyapp/HotelOps`.
  2. Set Environment Variables (Production + Preview) to match `.env.example`. Set `NEXT_PUBLIC_SITE_URL` to the deployed URL (e.g. `https://app.myhotelops.com`).
  3. In Supabase → Authentication → URL Configuration, add the production URL + `/auth/callback` to the allowed redirect URLs.
  4. Pushes to `main` deploy to Production; PRs get Preview deployments automatically.

## Scripts

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — lint
- `npm run onboard:tenant -- --slug=... --name=... --owner=... --property=...` — onboard a tenant from the CLI (manual fallback when the UI isn't an option)
- `npm run bootstrap:admin -- --email=... --password=...` — create the first platform admin (one-time)
- `npx tsx scripts/smoke-r2.ts` — R2 connectivity smoke test

## Roadmap

Modules planned beyond v1: reservations, housekeeping, staff scheduling, online (Stripe) billing, multi-org users / staff invitations, owner-editable file descriptions, AI-assisted captioning.
