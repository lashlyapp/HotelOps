-- Org-level add-on activation flags.
--
-- Add-ons (signage_unlimited, guest_experience) bill per property
-- (docs/pricing.md), but the activation decision lives at the org level
-- now to close the loophole where a customer could attach the add-on to
-- one property and use the feature across the whole portfolio.
--
-- These columns are the *intent* — "is this add-on active for the org?".
-- The actual line items are still SubscriptionItems on each property's
-- Stripe subscription (so each property's invoice carries its own $49 /
-- $39 line). Code keeps both in sync:
--
--   - Toggling on:  set the flag, then for each property's sub, add a
--                   SubscriptionItem with the add-on Price
--   - Toggling off: clear the flag, then remove the items
--   - New property: setup-checkout consults the org flags and includes
--                   the add-on Prices in the new subscription's line_items
--   - Reconciler:   hourly cron + login hook enforces the flag-to-items
--                   match across the whole org
--
-- billing_subscriptions.signage_unlimited_active / guest_experience_active
-- stay where they are — those reflect actual SubscriptionItem presence
-- on the Stripe side and drive the "active" chip on each property row.

alter table public.organizations
  add column if not exists signage_unlimited_addon_active boolean not null default false,
  add column if not exists guest_experience_addon_active boolean not null default false;

comment on column public.organizations.signage_unlimited_addon_active is
  'Org-level intent for the Signage Unlimited add-on. When true, every property''s Stripe subscription carries a hotelops_signage_unlimited_monthly SubscriptionItem. New properties added while true also inherit the item at creation.';
comment on column public.organizations.guest_experience_addon_active is
  'Org-level intent for the Guest Experience add-on. See signage_unlimited_addon_active for semantics.';
