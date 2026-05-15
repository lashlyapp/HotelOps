-- Per-property storage quota + metered overage.
--
-- Each property's R2 prefix is its storage namespace — media catalog,
-- work-order evidence, IT Hub documents, signage assets, arrival photos
-- all live under it. The base $100/property plan includes 25 GB. Beyond
-- that, the customer pays $5/property/month for each additional 25 GB
-- block (Stripe lookup key `hotelops_storage_block_25gb_monthly`).
-- See docs/pricing.md.
--
-- Two flavors of storage cap:
--   - Soft cap: storage_quota_bytes (default 25 GB). Crossing it triggers
--     a warning in the UI and adds a billable block. Uploads still go
--     through.
--   - Hard cap: 500 GB (constant in code). Uploads are refused; the
--     operator has to talk to us to lift it. Anti-abuse + cost control.
--
-- Recomputed nightly by /api/cron/storage-usage and on every login via
-- the same after()-style hook the billing reconciler uses, so the
-- on-screen number is never more than a few minutes stale once a user
-- touches the app.

-- ----------------------------------------------------------------------------
-- 1. Per-property usage + quota
-- ----------------------------------------------------------------------------
alter table public.properties
  add column if not exists storage_used_bytes bigint not null default 0
    check (storage_used_bytes >= 0),
  add column if not exists storage_used_at timestamptz,
  -- 25 GB. Operators on a future "high-volume" plan can have this lifted
  -- per-property without touching code.
  add column if not exists storage_quota_bytes bigint not null
    default (25::bigint * 1024 * 1024 * 1024)
    check (storage_quota_bytes >= 0);

comment on column public.properties.storage_used_bytes is
  'Total bytes under this property''s R2 prefix, refreshed nightly by /api/cron/storage-usage and opportunistically on login. May lag uploads by a few minutes.';
comment on column public.properties.storage_used_at is
  'Timestamp of the last storage_used_bytes refresh. Stale-after-24h triggers a re-sync on the next read.';
comment on column public.properties.storage_quota_bytes is
  'Soft storage cap. Usage beyond this is billed in 25 GB blocks via the hotelops_storage_block_25gb_monthly Stripe Price. Defaults to 25 GB; lift per-property for negotiated plans.';

-- ----------------------------------------------------------------------------
-- 2. Per-property billing mirror for the storage overage SubscriptionItem
-- ----------------------------------------------------------------------------
alter table public.billing_subscriptions
  add column if not exists storage_blocks_quantity integer not null default 0
    check (storage_blocks_quantity >= 0),
  add column if not exists storage_blocks_item_id text;

comment on column public.billing_subscriptions.storage_blocks_quantity is
  'How many 25 GB overage blocks are currently active on this property''s Stripe subscription. 0 = within base quota. Mirrors the SubscriptionItem.quantity in Stripe.';
comment on column public.billing_subscriptions.storage_blocks_item_id is
  'Stripe SubscriptionItem id for the storage-overage Price. Needed when reducing quantity to 0 (Stripe requires the item id, not the price id, to remove).';
