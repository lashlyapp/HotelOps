-- Persist the visitor's locale through the signup pipeline so every
-- subsequent communication with them speaks the same language they
-- saw on the marketing site.
--
-- Why two columns:
--   1. signup_pending.locale — captures the locale at OTP-request
--      time. Used by the OTP email (and any resend) before the org
--      exists. Without this, a French user requesting a new code
--      after switching browsers would silently get the English
--      version.
--   2. organizations.locale — copied across at verification time
--      and persisted forever. Used by the trial-reminder cron at
--      T-3 and T+0 days, and by any future transactional email that
--      isn't keyed off a live request (where getLocale() works
--      instead).
--
-- Constraint list mirrors LOCALES in src/lib/i18n/locales.ts. Both
-- move together in a single PR when we add a new market.

alter table public.signup_pending
  add column if not exists locale text not null default 'en'
    check (locale in ('en', 'es', 'fr'));

alter table public.organizations
  add column if not exists locale text not null default 'en'
    check (locale in ('en', 'es', 'fr'));

comment on column public.signup_pending.locale is
  'Visitor locale captured at OTP-request time. Used for the OTP / resend emails before the org row exists. Mirrors LOCALES in src/lib/i18n/locales.ts.';
comment on column public.organizations.locale is
  'Locale the owner signed up under. Copied from signup_pending at verification and persisted for cron-driven emails (trial reminders, etc.) that have no live request context to read getLocale() from.';
