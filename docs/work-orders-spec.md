# Maintenance & Service Work Orders — Product & Engineering Spec

Status: draft for review
Owner: TBD
Target: v1 MVP in this PR; v1.1 add-ons later

## 1. The wedge in one paragraph

Hotels already have PMS-side housekeeping for daily room turnover (rooms
flipping from "dirty" → "clean" → "ready"). What they don't have, and what
existing PMS modules do poorly, is **non-routine** maintenance and service
work: a guest reports a dripping faucet, the lobby AC stops cooling, the
breakroom microwave dies, a tile cracks in 312. These work orders span hours to
days, often hand off between shifts, and the institutional memory lives in
WhatsApp threads and a clipboard at the front desk. We give every property
a **photo/video-first Kanban board** where staff capture an issue in 10
seconds (snap, tag, assign) and the engineering / housekeeping lead can
see at a glance what's open, in progress, and done — with the proof in
the card. No long-form writing required.

## 2. Why photo/video evidence beats text

- A non-native-English-speaking housekeeper can document a stained carpet
  in 3 seconds with a photo. A text description takes 90 seconds, in any
  language, and never matches what the engineer sees on arrival.
- The "before" photo is the work order. The "after" photo is the proof of
  completion. Together they're an audit trail for the GM, a training
  artifact for new hires, and (occasionally) the document we send a guest
  to justify a damage charge.
- Short video (under 15s) captures intermittent problems: a humming
  compressor, a flickering ballast, a sticking lock — none of which a
  static photo communicates. We already have R2 + CDN for video; this
  feature reuses every line of that pipeline.

## 3. Feature scope

### v1 MVP — must ship in this PR

**Routes** (`/work-orders` group, sidebar nav between IT Hub and Properties):

1. **Board page** (`/work-orders`) — Kanban with four columns: **Open**, **In
   progress**, **Waiting on parts/vendor**, **Done**. Cards show:
   thumbnail of the first attachment, title, priority chip, assignee
   avatar/initials, age. Per-property tab filter at the top (mirrors
   `/media`). Status filter for `All` vs `Mine`. Sort by priority then
   age. Drag-and-drop to move column (optional progressive
   enhancement; tap-to-change menu is the baseline).
2. **New work order page** (`/work-orders/new`) — the capture flow:
   - Big **camera/file picker** at the top: take photo, take video, or
     pick from gallery. Multiple attachments supported.
   - Property selector, area/location (free text — "Room 312", "Pool
     deck", "Lobby"), category (single select), priority (low / normal
     / high / urgent).
   - Optional title (auto-suggested as `<Category> at <Location>` when
     blank).
   - One-line text description (optional). No required prose.
   - Submit → create work order in `open` status, redirect to detail.
3. **Work Order detail page** (`/work-orders/[id]`) — full media gallery, status
   timeline (state transitions with who/when), comments thread,
   assignment dropdown, priority + category edit, "Mark in progress",
   "Add evidence" (photo/video), "Mark done" (forces at least one
   "completion" photo/video).
4. **Activity feed** on detail — each state change, assignment, and
   evidence upload posts an event row. Comments are plain text, up to
   2000 chars, no markdown.
5. **Notifications**: when a work order is assigned to you, when a high/urgent
   work order is created at a property you manage. Email via Resend; in-app
   bell deferred to v1.1.

**Out of scope for v1:**

- Recurring/preventive maintenance (PM) checklists — v1.1
- SLA timers + breach alerts — v1.1
- Guest-facing intake (QR code → guest reports issue) — v2
- PMS integration (Mews / Cloudbeds work order feed) — v2
- Cost tracking (parts, vendor invoices) — v2
- Mobile native app — never; PWA from day one

### v1.1 — first iteration (next PR)

- **Recurring/PM work orders** — templates that spawn a work order on a cron (weekly
  pool filter clean, monthly fire-extinguisher check). Owner edits a
  template, the system materializes a `work_orders` row on schedule.
- **SLA timers** — per-priority due windows (`urgent = 4h`, `high = 24h`,
  `normal = 72h`, `low = 7d`). Cards show "due in 3h" / "overdue 2h".
  Overdue urgent/high triggers an email to the property manager.
- **In-app notification center** — bell icon on the app shell with unread
  count; mirrors the email notifications.
- **CSV export** — period + property → all work orders, statuses, times, who.

### v2 — moat features

- **Guest QR intake** — sticker in each room links to
  `/guest/[property]/report?room=312`. Guest picks a category, snaps a
  photo, submits. Creates a work order tagged `guest_reported = true`. Anti-
  spam via simple per-room rate limit.
- **Vendor portal** — share a magic link with a vendor (HVAC tech, plumber)
  to view a single work order and post completion evidence without an account.
- **Cost/parts ledger** — log a part used and dollar cost; aggregate per
  property per month, surface on Dashboard.
- **Reports** — top categories by property, average time-to-close, repeat
  offender rooms (rooms with >N work orders in 90 days — the rooms management
  needs to renovate).

## 4. Architecture

### Schema (one new migration)

`supabase/migrations/<timestamp>_work orders.sql`:

```sql
create type public.work_order_status as enum ('open', 'in_progress', 'waiting', 'done');
create type public.work_order_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.work_order_category as enum (
  'plumbing', 'electrical', 'hvac', 'appliance', 'furniture',
  'fixtures', 'flooring', 'paint_wall', 'door_lock', 'window',
  'lighting', 'tv_av', 'pool_spa', 'landscaping', 'pest',
  'housekeeping', 'lost_found', 'amenities', 'cleanliness',
  'guest_request', 'safety', 'it', 'other'
);

create table public.work orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  reference text not null,  -- human-friendly: WO-0001 per property
  title text not null,
  description text,
  status public.work_order_status not null default 'open',
  priority public.work_order_priority not null default 'normal',
  category public.work_order_category not null default 'other',
  location text,
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_email text,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, reference)
);

create index work orders_org_idx on public.work orders(org_id);
create index work orders_property_status_idx on public.work orders(property_id, status);
create index work orders_assignee_idx on public.work orders(assignee_id) where assignee_id is not null;

-- Attachments live in R2 under <property.r2_prefix>/_work-orders/<work_order_id>/<filename>.
-- One DB row per file so we can show captions, ordering, and kind w/o R2 round-trips.
create type public.work_order_attachment_kind as enum ('photo', 'video');

create table public.work_order_attachments (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work orders(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind public.work_order_attachment_kind not null,
  r2_key text not null,
  poster_key text,        -- for videos: still-frame thumbnail
  filename text not null,
  content_type text,
  size_bytes bigint not null default 0,
  caption text,
  -- 'before' (created with the work order), 'progress' (added during work),
  -- 'after' (uploaded with the "Mark done" transition).
  phase text not null default 'before' check (phase in ('before','progress','after')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index work_order_attachments_work_order_idx on public.work_order_attachments(work_order_id);

create table public.work_order_comments (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work orders(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  author_id uuid references public.profiles(id) on delete set null,
  author_email text,
  created_at timestamptz not null default now()
);

create index work_order_comments_work_order_idx on public.work_order_comments(work_order_id, created_at);

-- One row per audit-worthy state change (created, assigned, status,
-- priority, evidence). Renders the timeline on the detail page.
create table public.work_order_activity (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work orders(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,            -- 'created','assigned','status','priority','attachment','comment'
  from_value text,
  to_value text,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  created_at timestamptz not null default now()
);

create index work_order_activity_work_order_idx on public.work_order_activity(work_order_id, created_at);

-- Tags are a flat string list (engineering, housekeeping, F&B, etc.).
-- We use a join table rather than text[] so we can index per-tag filters later.
create table public.work_order_tags (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work orders(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  tag text not null check (char_length(tag) between 1 and 48),
  unique (work_order_id, tag)
);

create index work_order_tags_work_order_idx on public.work_order_tags(work_order_id);
create index work_order_tags_org_tag_idx on public.work_order_tags(org_id, tag);

-- RLS: standard org-scoped reads; writes via service role.
alter table public.work orders enable row level security;
alter table public.work_order_attachments enable row level security;
alter table public.work_order_comments enable row level security;
alter table public.work_order_activity enable row level security;
alter table public.work_order_tags enable row level security;

create policy work orders_select_org on public.work orders for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
create policy work_order_attachments_select_org on public.work_order_attachments for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
create policy work_order_comments_select_org on public.work_order_comments for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
create policy work_order_activity_select_org on public.work_order_activity for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
create policy work_order_tags_select_org on public.work_order_tags for select
  using (org_id = public.current_org_id() or public.is_platform_admin());
```

### Routes

```
src/app/(app)/work-orders/
  layout.tsx                    nav header (Board / New)
  page.tsx                      Kanban board (server component)
  new/page.tsx                  capture form
  [id]/page.tsx                 work order detail w/ media gallery + activity
  actions.ts                    server actions (create, transition, comment, attach, delete)
  _components/
    board.tsx                   column layout + cards
    card.tsx                    per-work order card
    capture-uploader.tsx        client camera/file picker w/ R2 presigned PUT
    status-picker.tsx           status dropdown
    priority-picker.tsx
    assignee-picker.tsx
    attach-button.tsx           shared upload control
    comment-form.tsx
    activity-list.tsx
  _lib/
    labels.ts                   status/priority/category labels + tones
    reference.ts                next-reference helper (WO-0001 per property)
```

### Existing-code reuse

| Need                              | Existing module                                              |
| --------------------------------- | ------------------------------------------------------------ |
| Org-scoped auth                   | `src/lib/auth/session.ts:requireOrgUser`                     |
| Service-role writes               | `src/lib/supabase/admin.ts`                                  |
| R2 upload + delete + presign      | `src/lib/r2/upload.ts`                                       |
| Public URL                        | `src/lib/r2/client.ts:r2PublicUrl`                           |
| Cache tag pattern                 | `src/lib/media/cache-tags.ts`                                |
| UI primitives                     | `src/components/ui/*`                                        |
| Video cover frame capture         | `src/app/(app)/media/_components/cover-picker.tsx`           |

### Storage layout

```
<property.r2_prefix>/
  _work-orders/
    <work_order_id>/
      <yyyymmdd-hhmmss-<rand>>.jpg      # photo
      <yyyymmdd-hhmmss-<rand>>.mp4      # video
      _posters/<same-basename>.jpg      # video poster
```

The `_work-orders/` prefix is hidden from `/media` listing (same exclusion list
as `_meta/`, `_posters/`, `_it-docs/`).

### Capture flow (mobile-first)

1. User taps **New work order** → form mounts a `<CaptureUploader>`.
2. Uploader exposes three actions on mobile: **Camera (photo)**, **Camera
   (video)**, **Library**. On desktop it shows **Choose files / drop here**.
3. Each `<input type="file" accept="image/*" capture="environment">`
   triggers the OS camera. Captured Blob → `r2PresignPutUrl` → direct PUT.
4. Photos: PUT and done. Videos: PUT, then off-DOM `<video>` decode picks
   a poster frame at ~0.33s and PUTs to `_posters/`. Same pattern as
   `/media` upload (reuse the helper functions in `drop-zone.tsx`).
5. On submit, the server action receives a list of `{ r2_key, kind,
   poster_key?, content_type, size }` and inserts `work_order_attachments` rows
   in the same transaction as the `work_orders` row.

### Reference numbering

`work orders.reference` is `WO-NNNN` per property (so each property starts at
`WO-0001`, mirroring how `events.reference` works). Implementation: a
`generate_work_order_reference(property_id)` SQL function that selects
`max(substring(reference from 5)::int)` for the property and returns
`WO-<n+1, zero-padded>`. Server action calls it before insert.

## 5. UX details

- The board page is the default landing. Cards show the first attachment
  as a 4:3 thumbnail so the user sees *what's wrong* before reading a
  word. Empty card (no media) is allowed but discouraged with a warning
  icon.
- Priority colors: low = neutral, normal = info, high = warning, urgent =
  danger. Same `Badge` tones the rest of the app uses.
- "Mark done" requires at least one attachment with `phase = 'after'`.
  Forces the proof-of-completion habit. Owner role can override with a
  one-line note (`work_order_activity.kind = 'force_done'`).
- The capture form remembers the last property + location + category in
  `localStorage` so a housekeeper filing five tickets on the same floor
  doesn't re-pick them five times.
- Mobile board: horizontal column scroll on `<sm`, classic 4-up grid on
  `≥sm`. iOS HIG 44px hit targets via existing `Button` sizing.

## 6. Risks & mitigations

| Risk                                                    | Mitigation                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Housekeeper uploads enormous 4K video and burns data    | Per-attachment 50 MB hard limit (single-PUT path). Encourage `<15s` in copy. Multipart + compression deferred to v1.1. |
| Staff mark "done" without an "after" photo              | Server-side check; cannot transition to `done` without ≥1 `phase = 'after'` attachment (owner override). |
| Sensitive guest data in a photo (passports, faces)      | Attachments inherit org-scoped CDN protection. Cover with a one-page privacy doc; v1.1 face-blur.   |
| Notification spam                                       | Throttle: at most one email per assignee per work order per 5 min; coalesce on the worker side.            |
| Stale assignees (former staff)                          | Assignee dropdown filters out profiles whose `org_id` doesn't match. Hard-delete cascades fire ON DELETE SET NULL. |

## 7. Rollout

This PR ships v1 MVP. After merge, dogfood on a friendly tenant for a
week, then enable for all tenants. No pricing change in v1 — bundled
into the base $100/property/month plan. We may move recurring/PM in
v1.1 behind a "Maintenance Pro" add-on if customer demand splits.
