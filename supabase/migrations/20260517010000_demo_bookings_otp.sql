-- /demo booking OTP — verify the visitor owns the email they
-- submitted before we fire the founder notification + visitor
-- confirmation emails. Prevents drive-by spam and accidental
-- typos that would otherwise burn the founder's inbox.
--
-- Mirrors the signup_pending pattern from 20260515010000_signup_otp_and_admin.sql:
-- one row per (email, attempt cycle), service-role-only access,
-- TTL via expires_at + a cron sweep. No RLS policies — every read
-- and write goes through the demo server actions running on the
-- admin client.
--
-- Why a dedicated table instead of reusing signup_pending: the
-- payloads diverge (no password / hotel_name semantics is
-- different / slot_id has no signup analog), and conflating them
-- would force every signup query to filter on a discriminator
-- column. The signup_pending unique(email) constraint also
-- collides — a visitor could be mid-signup and want to also book
-- a demo, which is legitimate.

create table public.demo_bookings_pending (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  visitor_name text not null,
  hotel_name text not null,
  property_count text,
  notes text,
  -- Stable slot id from buildDemoSlotDays (e.g.
  -- "2026-05-18T09:00PT"). The server re-parses it on verify
  -- to render a human label for the notification email; storing
  -- the id rather than the label keeps the source of truth in
  -- one place.
  slot_id text not null,
  -- Visitor's preferred language for the actual call — one of
  -- 'en' / 'es' / 'ko' / 'vi'. Distinct from visitor_locale
  -- (which records what locale the marketing site rendered in)
  -- because a French-locale visitor might still prefer the call
  -- in English.
  preferred_language text not null
    check (preferred_language in ('en', 'es', 'ko', 'vi')),
  visitor_locale text not null,
  otp_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  ip_address text,
  resends integer not null default 0,
  resent_at timestamptz,
  created_at timestamptz not null default now()
);

create index demo_bookings_pending_expires_idx
  on public.demo_bookings_pending(expires_at);

alter table public.demo_bookings_pending enable row level security;
-- No policies → service-role only.

comment on table public.demo_bookings_pending is
  'Short-lived hold for /demo bookings between OTP-request and OTP-verify. Row is deleted on successful verification; expired rows are swept by the same cron that cleans signup_pending.';
comment on column public.demo_bookings_pending.preferred_language is
  'Language the visitor wants the demo call conducted in. Limited to ''en'' / ''es'' / ''ko'' / ''vi'' — the four the founder speaks. Not the same as visitor_locale (what they read on the site).';
