-- Self-service signup with a 7-day, no-credit-card trial.
--
-- An organization created via the public /signup form gets a row-level
-- trial window: trial_started_at = now(), trial_ends_at = now() + 7 days.
-- While trial_ends_at is in the future the billing gate treats the org
-- as "trialing" instead of "restricted (no subscription)" so the owner
-- can use the product immediately without a card on file. After expiry
-- the gate flips to read-only with an "Add payment to keep editing"
-- nudge; data is preserved indefinitely so a prospect who comes back
-- later can convert.
--
-- The 10 GB trial cap is enforced via the existing per-property
-- storage_quota_bytes column (set to 10 GB on the auto-created starter
-- property; lifted to the 25 GB base default on conversion). A trial
-- org is also limited to a single property by the ownerAddPropertyAction
-- guard until a paid subscription is started.
--
-- Window length lives in src/lib/billing/trial.ts (TRIAL_DAYS) so changes
-- don't require a migration — the column just stores the absolute
-- end-time written at signup.

alter table public.organizations
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz;

comment on column public.organizations.trial_started_at is
  'When the self-serve trial began. Null on orgs created via platform-admin paths (which have no trial).';
comment on column public.organizations.trial_ends_at is
  'When the self-serve trial expires. Read by the billing gate: trial_ends_at > now() AND no active subscription → "trialing", else "restricted". Null on non-trial orgs.';

-- Frequent lookup pattern: "orgs whose trial expires soon" for a
-- conversion-nudge email cron. Partial index keeps it tiny.
create index if not exists organizations_trial_ends_at_idx
  on public.organizations(trial_ends_at)
  where trial_ends_at is not null;
