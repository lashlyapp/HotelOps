-- Multi-currency billing foundation.
--
-- An organization is created with a currency at signup, picked from
-- the visitor's locale (en→USD, es→EUR for now, fr→EUR, …). The
-- currency is immutable once set so the Stripe Customer + every
-- Subscription billed under it agree — switching mid-stream would
-- require a full Customer migration that Stripe doesn't make easy.
--
-- Supported currencies live in code (src/lib/billing/currency.ts);
-- the CHECK constraint here is intentionally narrow to fail loudly
-- if anything tries to insert an unsupported one. Add a currency to
-- the constraint + the code list as a single migration when we
-- launch a new market.

alter table public.organizations
  add column if not exists currency text not null default 'usd'
    check (currency in ('usd', 'eur', 'gbp', 'mxn', 'aud'));

comment on column public.organizations.currency is
  'ISO 4217 lowercase code for every Stripe invoice this org is billed in. Set once at signup and never changed — Stripe Customer + Subscriptions all agree on this value. Add new codes to the CHECK list + src/lib/billing/currency.ts.SUPPORTED_CURRENCIES together.';
