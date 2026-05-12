-- Rate-limiting + email-verification fields on tenant_signup_requests.
--
-- Rate-limiting: store the request's source IP so the server action can
-- count recent signups from the same address (or same email) and refuse
-- if the threshold is exceeded. Doing this in-table avoids a separate
-- Redis/Upstash dependency.
--
-- Email-verification: a row inserted by /signup is invisible to admins
-- until the prospect clicks the verification link in the email we send.
-- That ensures the email address is reachable + owned by the submitter
-- before we display the lead on /admin or notify the platform admin.
--
-- All columns nullable for back-compat with rows already in the table
-- (only pre-launch test data).

alter table public.tenant_signup_requests
  add column if not exists ip_address inet,
  add column if not exists email_verified_at timestamptz,
  add column if not exists email_verification_token text,
  add column if not exists email_verification_sent_at timestamptz;

-- Lookup index for the verification GET; the token is high-entropy so
-- a btree is fine.
create unique index if not exists tenant_signup_requests_email_verification_token_idx
  on public.tenant_signup_requests(email_verification_token)
  where email_verification_token is not null;

-- Rate-limit support indexes: count rows by IP / email over a recent
-- time window. Partial indexes scoped to pending + verification
-- inserts keep them cheap.
create index if not exists tenant_signup_requests_ip_created_idx
  on public.tenant_signup_requests(ip_address, created_at desc)
  where status = 'pending';
create index if not exists tenant_signup_requests_email_created_idx
  on public.tenant_signup_requests(lower(email), created_at desc)
  where status = 'pending';
