# Arrival Experience — Product & Engineering Spec

Status: draft for review
Owner: TBD
Target: v1 MVP later (this PR ships the spec only; build follows the
tasks + signage PRs).

## 1. The wedge in one paragraph

Every hotel under 100 rooms hands guests a printed key card sleeve with
the Wi-Fi password scribbled in pen and a folded photocopy of the
breakfast hours. Anything richer (a directory, a local guide, restaurant
hours, gym hours, a marketing offer) means a third-party app (Duve,
Canary, Akia) at $2–$6 per occupied room per month — i.e. **more than
HotelOps's entire base subscription per property**. We give the hotel
a no-app, **informational-only** arrival page built from the data they
already store with us (property name, logo, brand color, restaurant
hours, gym, Wi-Fi from IT Hub), and we generate a printable QR card
the front desk drops in the room. Guest scans the QR with the camera
app they already have, sees the page in their default browser, no
account, no install. Done.

## 2. Why "informational only"

- We are not in the upsell / messaging business yet. Doing so requires
  PMS integration (reservation lookup), payment capture for upgrades,
  and 2-way SMS. All of that is a 9-month build with a compliance
  surface; "informational only" is a 2-week build.
- The CCPA / GDPR surface area for an anonymous informational page is
  near-zero. No personal data collected.
- Hotels who want messaging can keep their existing vendor — we don't
  threaten that contract. We threaten the *content* portion which
  90% of properties use.

## 3. Feature scope

### v1 MVP

**Operator UI** (`/arrival` route group, sidebar nav after Properties):

1. **Arrival builder per property** — one canonical arrival page per
   property; operator edits sections in any order, save publishes.
2. **Sections** (each toggleable on/off):
   - **Welcome message** — heading + 2-paragraph rich-text (sanitized).
   - **Wi-Fi** — auto-imported from IT Hub `it_networks` where
     `is_shareable = true`; operator can hide individual networks per
     arrival page. Each shown as a labelled chip with SSID + password
     + a "tap to copy".
   - **Breakfast / dining hours** — list of items with name, hours,
     short description, optional photo (R2 picker).
   - **Gym / amenities** — name, hours, photo, blurb.
   - **Restaurant menu** — items grouped by section (Breakfast, Lunch,
     Dinner, Bar). Each item: name, description, price, optional photo,
     dietary chips (V, VG, GF, DF, N). **Informational only** — no
     ordering, no cart.
   - **Room service menu** — same shape as Restaurant; separate
     section so hours/availability can differ.
   - **Local events / things to do** — title, dates, blurb, photo,
     optional external URL.
   - **Marketing** — up to 3 banner cards: image + heading +
     subheading + optional outbound link.
   - **Quick info** — checkout time, parking, pet policy, smoking
     policy, contact phone (free-text key/value pairs).
3. **Preview** — live iframe of the public arrival page on the right.
4. **Publish** — writes a version row; the public page reads the latest
   published version. Operator can revert to a prior version (last 10
   kept).
5. **Print QR card** — `/arrival/[property_id]/print` renders a single
   8.5×11 page (or A4) with property logo, property name, room number
   blank, QR code, short URL, and a tagline. Operator can print N copies
   on cardstock and drop one in each room (or laminate one card per
   room and refresh annually). Optional per-room override: pre-fill the
   room number on the printable.

**Public page** (`/a/[property_slug]`, no auth, no chrome):
- Mobile-first single-column layout.
- Sticky property header (logo, name, current local time + weather in
  v1.1).
- Anchor nav for sections (Wi-Fi · Dining · Gym · Menu · Local · Info).
- Brand color from `properties.brand_color` (new column, default to
  primary token).
- Lazy-loaded images via `next/image` + the R2 CDN.
- Cache: `s-maxage=300, stale-while-revalidate=86400`. Publish
  invalidates via `revalidatePath('/a/<slug>')`.

**Out of scope for v1:**

- Multi-language toggle — v1.1 (English only initially)
- Per-room personalization (guest name, reservation lookup) — v2
- Messaging / chat — v2
- Ordering / payment — never (out of charter)

### v1.1

- **Multi-language** — operator authors content in English, picks one
  or more secondary languages, we machine-translate via OpenAI/DeepL
  with a "review" step. Cache one HTML version per `(slug, lang)`.
- **Weather + local time** in the header (Open-Meteo, no API key).
- **Section reordering** via drag-and-drop in the builder.
- **Template library** — three canned arrival templates (Boutique,
  Business, Resort) the operator can apply with one click as a
  starting point.

### v2

- **Per-room URL** `a/[slug]/r/[room_number]` — same content, but
  embeds the room number in the QR for the front desk to track scans
  per room (privacy-preserving: no guest identity).
- **Reservation lookup** (Mews/Cloudbeds/Opera) → personalized welcome
  ("Welcome, Mr. Smith").

## 4. Architecture

### Schema (one new migration)

`supabase/migrations/<timestamp>_arrival.sql`:

```sql
create table public.arrival_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null unique references public.properties(id) on delete cascade,
  -- The slug used in the public URL /a/<slug>. Defaults to property.slug
  -- but operator can override (e.g. shorter "kingscourt" vs "kingscourt-hotel").
  public_slug text not null,
  brand_color text,                       -- "#0F172A" or null = use design tokens
  welcome_heading text,
  welcome_body text,                      -- sanitized markdown subset
  quick_info jsonb not null default '[]', -- [{label, value}]
  checkout_time text,
  parking text,
  pet_policy text,
  smoking_policy text,
  contact_phone text,
  hidden_network_ids uuid[] not null default '{}',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index arrival_pages_public_slug_idx on public.arrival_pages(public_slug);

create type public.arrival_section_kind as enum (
  'dining_hours', 'amenity', 'menu', 'room_service',
  'local_event', 'marketing'
);

create table public.arrival_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.arrival_pages(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind public.arrival_section_kind not null,
  title text,
  -- For dining_hours/amenity/local_event/marketing: list of items.
  -- For menu/room_service: groups -> items with prices.
  body jsonb not null default '{}',
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index arrival_sections_page_idx on public.arrival_sections(page_id, sort_order);

-- Last 10 published versions kept for revert.
create table public.arrival_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.arrival_pages(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  snapshot jsonb not null,    -- full page + sections at publish time
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz not null default now()
);

create index arrival_versions_page_idx on public.arrival_versions(page_id, published_at desc);

-- RLS: standard org-scoped read; public page reads via service role.
alter table public.arrival_pages enable row level security;
alter table public.arrival_sections enable row level security;
alter table public.arrival_versions enable row level security;

create policy arrival_pages_select_org on public.arrival_pages for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
create policy arrival_sections_select_org on public.arrival_sections for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
create policy arrival_versions_select_org on public.arrival_versions for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
```

### Routes

```
src/app/(app)/arrival/
  page.tsx                              list of properties + edit links
  [propertyId]/
    page.tsx                            builder (form + preview iframe)
    sections/[sectionId]/page.tsx       per-section editor (menu groups etc.)
    print/page.tsx                      printable QR card layout
    actions.ts                          publish, save section, revert version

src/app/a/[slug]/
  page.tsx                              public arrival page
  not-found.tsx

src/app/api/arrival/
  qr/[slug]/route.ts                    PNG QR code generator (server-rendered)
```

### Public page rendering

A single React Server Component reads the latest published snapshot from
`arrival_versions` (NOT the live `arrival_pages` row) so unpublished
drafts never leak. Cached with `unstable_cache` tagged
`arrival:<page_id>`; publish action calls `revalidateTag` to bust.

### QR code

Server-side QR generation: render a PNG via the `qrcode` npm package
(MIT, no native deps), respond with `Content-Type: image/png` and
`Cache-Control: public, max-age=86400`. URL embedded is the full
`https://<site>/a/<slug>`. For the printable card we inline a 1024px QR
so it scans from across a hotel room.

### Print layout

`/arrival/[propertyId]/print` uses CSS print rules:

```css
@page { size: letter; margin: 0.5in; }
@media print {
  .no-print { display: none; }
  body { background: white; }
}
```

Operator hits print, the browser native print dialog shows. No PDF
backend. We may add server-rendered PDF in v2 if hotels ask for a one-
click "send to printer".

### Existing-code reuse

| Need                              | Existing module                                              |
| --------------------------------- | ------------------------------------------------------------ |
| Org-scoped auth                   | `src/lib/auth/session.ts:requireOrgUser`                     |
| R2 file picker (photos)           | `src/app/(app)/media` browser, extracted into a popover      |
| Public URL                        | `src/lib/r2/client.ts:r2PublicUrl`                           |
| Wi-Fi data                        | `it_networks` table (filter by `is_shareable = true`)        |
| Brand wordmark / footer           | `src/components/brand`, `src/components/layout/footer`       |

### Sanitization

The welcome body and section text fields accept a tiny markdown subset:
bold, italic, links (auto-`rel=noopener noreferrer`), unordered list,
line break. We use a server-side sanitizer (regex-based for v1) — no
DOMPurify dep needed because we render server-side to plain JSX, not
`dangerouslySetInnerHTML`. Anything outside the subset gets stripped.

## 5. UX details

- **One arrival page per property** in v1 — no A/B variants, no per-room
  variants. Keeps the model simple and the print process predictable.
- **The QR is the moat for the front desk.** No app to recommend, no
  download to fail. A printed card on the desk in the room is a
  zero-friction handoff.
- **Saving is auto + manual.** Auto-save the draft every 5 seconds.
  "Publish" is the explicit action that promotes draft → public.
- **Preview shows the draft**, with a banner `Preview of unpublished
  changes`. Public URL shows the last published snapshot.

## 6. Risks & mitigations

| Risk                                                          | Mitigation                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Operator pastes a phishing URL in marketing banner            | All outbound links get `rel=noopener noreferrer`; allowlist domain warning in editor; v1.1 link health check. |
| Public page indexed by Google (Wi-Fi password leaks)          | `noindex,nofollow` meta on the public page; QR-only distribution; rate-limit by IP.   |
| Sensitive Wi-Fi exposure                                       | Only `it_networks.is_shareable = true` networks are surfaced. Operator confirms per network in builder.        |
| Revert clobbers good work                                      | Revert creates a new version row pointing at the old snapshot; nothing is destructive. |
| Stale menu prices                                              | "Last updated" stamp visible on every menu section; nudge if older than 90 days.       |

## 7. Pricing

Bundled into base $100/property/month. No add-on charge in v1 — this is
a retention/upgrade-lever feature, not a revenue line.

If usage data shows >50% of properties using it, consider unbundling in
v2 as part of a "Guest Experience" tier alongside the per-room
personalization & messaging features.

## 8. Rollout

After this PR (tasks + signage), the arrival module is the next major
build (2-week target). Sequence:

- Week 1: schema + builder UI + preview + section editors.
- Week 2: public page + QR + print layout + version revert + dogfood.
