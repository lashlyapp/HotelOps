-- Org-level billing identity columns + explicit uniqueness on Stripe
-- subscription ids. These close two billing-correctness gaps in the
-- per-property subscription model:
--
--  1. Duplicate Stripe Customers on retry. ensureStripeCustomer needs a
--     durable per-org home for stripe_customer_id so a customer that's
--     created mid-flow (before the first subscription syncs) isn't
--     re-created on the next attempt. Living on `organizations` makes the
--     identity independent of property lifecycle and survives migrations
--     of billing_subscriptions.
--
--  2. Setup-fee double-charge race. Two parallel property additions both
--     querying "does this org have any subscription yet?" can both decide
--     to charge the one-time setup fee. setup_fee_charged_at is updated
--     atomically (UPDATE … WHERE setup_fee_charged_at IS NULL RETURNING),
--     which serializes "claim the setup-fee right" without needing
--     advisory locks or a separate ledger table.
--
-- Also adds an explicit partial unique index on
-- billing_subscriptions.stripe_subscription_id so a buggy upsert can't
-- silently overwrite a different property's subscription. (The PK swap
-- in 20260513000000 removed the original uniqueness guarantee that the
-- column had under the old schema.)

alter table public.organizations
  add column if not exists stripe_customer_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_stripe_customer_id_key'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_stripe_customer_id_key
      unique (stripe_customer_id);
  end if;
end$$;

alter table public.organizations
  add column if not exists setup_fee_charged_at timestamptz;

-- Backfill stripe_customer_id for orgs that already have a subscription
-- row. Safe to run repeatedly: only updates orgs that don't yet have a
-- customer id stamped at the org level.
update public.organizations o
set stripe_customer_id = bs.stripe_customer_id
from public.billing_subscriptions bs
where bs.org_id = o.id
  and o.stripe_customer_id is null
  and bs.stripe_customer_id is not null;

-- Backfill setup_fee_charged_at for orgs that already have at least one
-- Stripe subscription. We assume the setup fee was applied on the first
-- subscription; the conservative choice is to assume it was charged so
-- we don't double-charge an existing tenant on their next property add.
update public.organizations o
set setup_fee_charged_at = coalesce(
  (select min(bs.created_at) from public.billing_subscriptions bs
    where bs.org_id = o.id and bs.stripe_subscription_id is not null),
  setup_fee_charged_at
)
where setup_fee_charged_at is null
  and exists (
    select 1 from public.billing_subscriptions bs
    where bs.org_id = o.id and bs.stripe_subscription_id is not null
  );

-- Explicit partial unique on stripe_subscription_id. NULL is allowed
-- (rows that have an org-level customer but no subscription yet); only
-- non-null values are deduplicated. Partial because the previous
-- `unique` constraint on this column rejected NULLs implicitly via
-- multiple-NULL-OK semantics, which is what we want here.
create unique index if not exists
  billing_subscriptions_stripe_subscription_id_key
  on public.billing_subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

notify pgrst, 'reload schema';
