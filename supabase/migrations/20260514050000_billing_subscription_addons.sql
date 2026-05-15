-- Per-property add-on flags on billing_subscriptions.
--
-- Each property's Stripe subscription has a single base SubscriptionItem
-- (the $100 hotelops_per_property_monthly Price). Operators can opt into
-- two optional add-ons that are billed as additional SubscriptionItems
-- on the same subscription:
--
--   hotelops_signage_unlimited_monthly  — $49/property/month
--   hotelops_guest_experience_monthly   — $39/property/month
--
-- We mirror "is this add-on present on the subscription right now?" into
-- two boolean columns plus the Stripe SubscriptionItem id (needed when
-- removing the add-on, since the Stripe API takes the item id, not the
-- price id). The webhook sets these from customer.subscription.updated;
-- the operator UI on /billing reads them to render the toggle state.
--
-- No feature gating against these flags yet — the columns are
-- informational + drive billing. Per the spec lock-in, the add-on
-- features (signage, arrival) remain accessible regardless; only the
-- billing line item differs.

alter table public.billing_subscriptions
  add column if not exists signage_unlimited_active boolean not null default false,
  add column if not exists signage_unlimited_item_id text,
  add column if not exists guest_experience_active boolean not null default false,
  add column if not exists guest_experience_item_id text;

comment on column public.billing_subscriptions.signage_unlimited_active is
  'True when the hotelops_signage_unlimited_monthly Price is an active SubscriptionItem on this property''s subscription.';
comment on column public.billing_subscriptions.signage_unlimited_item_id is
  'Stripe SubscriptionItem id for the signage_unlimited add-on. Needed for stripe.subscriptionItems.del when the operator removes the add-on.';
comment on column public.billing_subscriptions.guest_experience_active is
  'True when the hotelops_guest_experience_monthly Price is an active SubscriptionItem on this property''s subscription.';
comment on column public.billing_subscriptions.guest_experience_item_id is
  'Stripe SubscriptionItem id for the guest_experience add-on.';
