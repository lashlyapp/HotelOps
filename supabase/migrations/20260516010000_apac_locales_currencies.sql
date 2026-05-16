-- Extend organizations.locale + signup_pending.locale + organizations.currency
-- to cover the APAC market launch (Japan, Korea, Vietnam — plus
-- Singapore on the currency side, which doesn't get its own locale
-- since SG business operates in English).
--
-- The original CHECK constraints in 20260515020000_org_currency.sql
-- and 20260515030000_org_locale.sql were intentionally narrow so any
-- unexpected value fails loudly. Extending them requires dropping
-- and recreating since CHECK constraints don't ALTER in place on
-- Postgres. Constraint names follow the Postgres default
-- (`<table>_<column>_check`) — present in pg_catalog because the
-- earlier migrations used inline `check (...)` syntax.
--
-- After this PR the canonical lists are:
--   organizations.locale + signup_pending.locale: en, es, fr, ja, ko, vi
--   organizations.currency:                       usd, eur, gbp, mxn, aud,
--                                                 jpy, krw, vnd, sgd
--
-- These must stay in sync with src/lib/i18n/locales.ts (LOCALES) and
-- src/lib/billing/currency.ts (SUPPORTED_CURRENCIES). A single PR
-- moves all three.

alter table public.organizations
  drop constraint if exists organizations_locale_check,
  add constraint organizations_locale_check
    check (locale in ('en', 'es', 'fr', 'ja', 'ko', 'vi'));

alter table public.signup_pending
  drop constraint if exists signup_pending_locale_check,
  add constraint signup_pending_locale_check
    check (locale in ('en', 'es', 'fr', 'ja', 'ko', 'vi'));

alter table public.organizations
  drop constraint if exists organizations_currency_check,
  add constraint organizations_currency_check
    check (currency in ('usd', 'eur', 'gbp', 'mxn', 'aud', 'jpy', 'krw', 'vnd', 'sgd'));
