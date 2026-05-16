-- Lead capture for the "10 things to do today to modernize your boutique
-- hotel" PDF guide (and any future gated content downloads). One row per
-- form submission. Service-role-only access — every read and write goes
-- through the /blog guide download server actions on the admin client.
--
-- Why a dedicated table instead of reusing demo_bookings: the payloads
-- diverge (no slot / no preferred-language / no OTP cycle), the unique
-- constraint shape is different (we allow repeat downloads from the
-- same email so we can see lead frequency, not block it), and conflating
-- a passive content download with an active sales-meeting request would
-- pollute the founder's view of pipeline quality.

create table public.guide_leads (
  id uuid primary key default gen_random_uuid(),
  -- Lowercased on insert; not unique — a visitor downloading the guide
  -- a second time from a different device is a real signal, not an error.
  email text not null,
  visitor_name text not null,
  hotel_name text not null,
  -- Optional but encouraged. Free text — we don't try to validate
  -- URL shape because operators paste anything from "example.com"
  -- to a full https URL with utm params, and rejecting any of those
  -- forms would just drop leads.
  website text,
  -- Slug of the gated asset, e.g. '10-things-modernize-boutique-hotel'.
  -- Keeping it as a column (rather than a separate guides table)
  -- because we have one guide today and adding a join for a single
  -- string would be overkill. Promote to a real FK if/when we have
  -- more than a few gated downloads.
  guide_slug text not null,
  -- Locale the marketing site rendered for the visitor when they
  -- submitted. Useful for understanding which language audiences
  -- the guide actually reaches.
  visitor_locale text not null,
  ip_address text,
  user_agent text,
  -- UTM-style attribution snapshot, mirroring the pattern used by
  -- the existing utm_capture flow. Stored as plain columns rather
  -- than a JSONB blob so reporting queries stay first-class SQL.
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz not null default now()
);

create index guide_leads_email_idx on public.guide_leads(lower(email));
create index guide_leads_guide_slug_idx on public.guide_leads(guide_slug);
create index guide_leads_created_at_idx on public.guide_leads(created_at desc);

alter table public.guide_leads enable row level security;
-- No policies → service-role only. All access is via the admin client
-- inside the requestGuideDownload server action.

comment on table public.guide_leads is
  'Lead-magnet submissions for gated content downloads (e.g. the boutique-modernization PDF guide). Service-role-only.';
comment on column public.guide_leads.guide_slug is
  'Slug of the gated asset (e.g. ''10-things-modernize-boutique-hotel''). Plain column for now; promote to a FK on a guides table once we have several.';
comment on column public.guide_leads.website is
  'Free-text website field. We deliberately do not validate URL shape — operators paste anything and dropping leads on regex misses costs more than malformed values do.';
