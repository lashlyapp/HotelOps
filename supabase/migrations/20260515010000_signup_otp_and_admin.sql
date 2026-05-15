-- Self-serve signup hardening: email-OTP verification before account
-- creation, plus admin-visible trial lifecycle tracking and a daily
-- cron for trial-expiry nudge emails.
--
-- Rationale (signup OTP):
--   The first version of self-serve signup auto-confirmed emails. A
--   bot could harvest free trials in bulk, and an attacker could
--   provision an account on a victim's email. Both classes of abuse
--   are killed by requiring the user to read a 6-digit code from
--   their inbox before the org / auth user / property are created.
--   The pending row holds the form data (with the password stored
--   AES-256-GCM-encrypted under SIGNUP_ENCRYPTION_KEY) until the
--   user proves they control the address.
--
-- Rationale (trial reminder columns):
--   Conversion ratios collapse without a touchpoint between sign-up
--   and expiry. The cron at /api/cron/trial-expiry sends a T-3 nudge
--   and a T+0 "trial ended" email; the two timestamp columns make
--   the cron idempotent (we never re-send the same nudge).
--   `trial_converted_at` lets the admin dashboard split active
--   trials, converted trials, and lapsed trials at a glance.

-- ---------------------------------------------------------------------------
-- 1. Pending signups (OTP verification gate)
-- ---------------------------------------------------------------------------
create table public.signup_pending (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  hotel_name text not null,
  -- AES-256-GCM(IV || ciphertext || authTag), base64.
  -- Decrypted at verification time and handed to
  -- supabase.auth.admin.createUser; the row is deleted the moment
  -- the auth user exists, so the encrypted blob is never long-lived.
  password_enc text not null,
  -- SHA-256 of the plaintext 6-digit code, hex. The plaintext only
  -- exists in the verification email; the DB row by itself is not
  -- sufficient to verify.
  otp_hash text not null,
  -- Wrong-code attempt counter. Verification action rejects when this
  -- hits the cap so a bot can't brute the 6-digit space.
  attempts integer not null default 0
    check (attempts >= 0 and attempts <= 10),
  expires_at timestamptz not null,
  ip_address inet,
  -- "Resend code" usage counter — also rate-limited so we can't be
  -- used as a spam-amplifier toward arbitrary inboxes.
  resends integer not null default 0
    check (resends >= 0 and resends <= 5),
  resent_at timestamptz,
  created_at timestamptz not null default now()
);

-- One pending signup per email at a time. Resends update the row in
-- place (rotates OTP, bumps resends counter); a fresh signup attempt
-- after expiry replaces the row via on-conflict upsert.
create unique index signup_pending_email_uniq
  on public.signup_pending(lower(email));
create index signup_pending_expires_idx
  on public.signup_pending(expires_at);

alter table public.signup_pending enable row level security;
-- No policies → service-role only. The /signup actions all run through
-- createAdminClient(), which bypasses RLS.

comment on table public.signup_pending is
  'In-flight signup attempts awaiting OTP verification. Service-role only. GC''d nightly by /api/cron/trial-expiry; rows past expires_at are deleted.';

-- ---------------------------------------------------------------------------
-- 2. Trial lifecycle tracking on organizations
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists trial_reminder_t3_sent_at timestamptz,
  add column if not exists trial_expired_email_sent_at timestamptz,
  add column if not exists trial_converted_at timestamptz;

comment on column public.organizations.trial_reminder_t3_sent_at is
  'When the T-3-day trial-ending reminder email was sent. Set by /api/cron/trial-expiry to make the cron idempotent.';
comment on column public.organizations.trial_expired_email_sent_at is
  'When the T+0 trial-ended email was sent. Dedupes the cron in the same way.';
comment on column public.organizations.trial_converted_at is
  'When the org converted trial → paid (first Stripe subscription created). Null on trials that never converted, and on admin-provisioned tenants that never had a trial. Powers the admin dashboard trial-conversion metric.';

-- ---------------------------------------------------------------------------
-- 3. Drop dead RLS on tenant_signup_requests
-- ---------------------------------------------------------------------------
-- Self-serve signups now go through the service-role client and the
-- table is purely an audit log. The original anon-insert policy
-- (status='pending') has no remaining caller — drop it so the schema
-- doesn't claim a public-write surface we don't actually have.
drop policy if exists tenant_signup_requests_anon_insert
  on public.tenant_signup_requests;
