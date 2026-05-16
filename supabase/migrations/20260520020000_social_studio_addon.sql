-- Social Studio add-on.
--
-- Third paid add-on, alongside Signage Unlimited ($49) and Guest
-- Experience ($39). Social Studio is **$19 / property / month** and
-- unlocks the /social feature: one AI-drafted post per day, drawn
-- from the property's events / weather / media catalog, with thumbs
-- feedback that adapts the brand voice over time.
--
-- Cost model: generation runs once per property per day from a Vercel
-- cron. AI inference is billed to a platform-wide OpenAI key (set in
-- OPENAI_API_KEY), not to the tenant. At gpt-4o-mini token rates one
-- generation is ~$0.0006, so the $19 price point covers the AI cost
-- by a comfortable two orders of magnitude. There is no
-- user-initiated regeneration — that's how we keep the cost line
-- flat and predictable.
--
-- Same plumbing as the existing two add-ons:
--   - organizations.social_studio_addon_active is the org-level
--     intent (matches signage_unlimited_addon_active /
--     guest_experience_addon_active).
--   - billing_subscriptions.social_studio_active / _item_id mirror
--     the per-property Stripe SubscriptionItem state via the
--     subscription webhook (matches signage_unlimited_active /
--     guest_experience_active).
--   - Stripe Price lookup key: hotelops_social_studio_monthly
--     (set up in the Stripe Dashboard separately; the lookup key is
--     constant across re-priced grandfathering events).
--
-- Backfill: all existing rows default to false. The cron filters on
-- the org flag, so nothing starts billing or generating until an
-- owner toggles the add-on on from /billing.

alter table public.organizations
  add column if not exists social_studio_addon_active boolean not null default false;

comment on column public.organizations.social_studio_addon_active is
  'Org-level intent for the Social Studio add-on. When true, every property''s Stripe subscription carries a hotelops_social_studio_monthly SubscriptionItem and the daily-post cron generates one post per property each morning. See signage_unlimited_addon_active for the broader semantics.';

alter table public.billing_subscriptions
  add column if not exists social_studio_active boolean not null default false,
  add column if not exists social_studio_item_id text;

comment on column public.billing_subscriptions.social_studio_active is
  'True when the hotelops_social_studio_monthly Price is an active SubscriptionItem on this property''s subscription.';
comment on column public.billing_subscriptions.social_studio_item_id is
  'Stripe SubscriptionItem id for the social_studio add-on. Needed for stripe.subscriptionItems.del when the operator removes the add-on.';
