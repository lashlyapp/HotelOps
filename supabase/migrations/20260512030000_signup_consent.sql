-- Persist the user's consent metadata on each public signup request so
-- there is a defensible audit trail if a customer later disputes ever
-- agreeing to the Terms / Privacy Policy. We store:
--
--   agreed_at:                when they checked the box (server clock)
--   agreed_terms_version:     last-updated date of /terms at acceptance
--   agreed_privacy_version:   last-updated date of /privacy at acceptance
--
-- Versions are plain TEXT (e.g. '2026-05-12') rather than a numeric
-- enum so we can bump them without a schema change. They're sourced
-- from the TERMS_OF_SERVICE_LAST_UPDATED / PRIVACY_POLICY_LAST_UPDATED
-- constants in /terms and /privacy respectively.
--
-- Nullable for back-compat with rows inserted before this migration
-- (none exist in production today; pre-launch only).

alter table public.tenant_signup_requests
  add column if not exists agreed_at timestamptz,
  add column if not exists agreed_terms_version text,
  add column if not exists agreed_privacy_version text;

-- The anon-insert RLS policy on this table still only allows status =
-- 'pending'; nothing else needs to change.
