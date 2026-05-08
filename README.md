# MyHotelOps

Multi-tenant SaaS for hotel property owners. v1 ships a centralized media library with permanent CDN URLs, plus check-payment billing. Auth is invite-only, RLS-enforced.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS v4
- **Supabase** — auth + Postgres (`@supabase/ssr`) with RLS-by-default
- **Cloudflare R2** — media storage, served from `cdn.myhotelops.com`
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
   - **Tenant owner** (`/properties` and `/team`, visible to `org_owner` role only): manages their own properties and team members with email + temporary password.
   - **Anyone**: change their own password from `/account`.

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
