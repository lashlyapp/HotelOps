# MyHotelOps

Multi-tenant SaaS for hotel property owners. v1 ships a centralized media library with permanent CDN URLs, plus check-payment billing. Auth is invite-only, RLS-enforced.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS v4
- **Supabase** — auth + Postgres (`@supabase/ssr`) with RLS-by-default
- **Cloudflare R2** — media storage, served from `cdn.myhotelops.com`
- **Vercel** — hosting

## Features (v1)

- **Public landing page** at `/`
- **Invite-only auth** with set-password flow on first login
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

2. Apply the database schema (one-time):

   1. Open Supabase Dashboard → SQL Editor.
   2. Paste the contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   3. Run.

3. Seed CG Hotel Group + properties (and optionally invite the owner):

   ```bash
   # In .env.local, optionally set:
   #   SEED_OWNER_EMAIL=owner@cghotelgroup.com
   npm run setup
   ```

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

```
app-hotelops/                       ← bucket
  cg-hotel-group/                   ← {org-slug}
    cupertino-hotel/                ← {property-slug}
      lobby-view-01.jpg
      ...
    grand-hotel/
      ...
```

Each file is served from `https://cdn.myhotelops.com/{key}`. Filenames are humanized into descriptions on the fly (e.g. `lobby-view-01.jpg` → "Lobby View 01").

The bucket is configured with **public access enabled** and a custom domain bound to the platform CDN. To onboard a new customer:

1. Choose a slug (e.g. `palace-resorts`) and create the prefix folders in R2 (or just upload — R2 creates prefixes lazily).
2. Insert the org + properties via SQL or extend `scripts/setup.ts`.
3. Invite the owner via `inviteUserByEmail`; they'll land on `/set-password` after clicking the email link.

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

- **CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint + `next build` on every push to `main` and on PRs. Build uses placeholder env vars so no secrets are required in CI.
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
- `npm run setup` — seed CG Hotel Group + invite owner (requires migration applied)
- `npx tsx scripts/smoke-r2.ts` — R2 connectivity smoke test

## Roadmap

Modules planned beyond v1: reservations, housekeeping, staff scheduling, online (Stripe) billing, multi-org users / staff invitations, owner-editable file descriptions, AI-assisted captioning.
