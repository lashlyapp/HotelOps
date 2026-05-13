-- Move billing_subscriptions from one-row-per-org to one-row-per-property.
--
-- The customer requirement is that each property bills to its own credit
-- card. Stripe subscriptions hold exactly one default_payment_method, so we
-- model each property as its own Stripe Subscription under a shared org-level
-- Stripe Customer. This migration restructures billing_subscriptions to
-- match: property_id becomes the primary key; org_id and stripe_customer_id
-- stay denormalized on the row so the org-scoped RLS policy and the org-level
-- queries (Manage billing portal, admin listings) keep working without a
-- join.
--
-- Backfill strategy for any existing rows: assign the row to the org's
-- oldest property. There is no clean way to fan a legacy org-level
-- subscription (quantity = N) out into N Stripe subscriptions from SQL — that
-- has to happen Stripe-side via an admin script if we ever have live data
-- here. For now this is a young system; the migration is conservative and
-- non-destructive when properties exist, and removes the row when an org has
-- no properties at all (in which case the legacy subscription was orphaned
-- anyway).

-- ----------------------------------------------------------------------------
-- 1. Add property_id (nullable for the backfill window).
-- ----------------------------------------------------------------------------
alter table public.billing_subscriptions
  add column if not exists property_id uuid
    references public.properties(id) on delete cascade;

-- ----------------------------------------------------------------------------
-- 2. Backfill: each existing row points at the oldest property in its org.
--    Rows whose org has no properties get deleted — the subscription was
--    effectively dangling.
-- ----------------------------------------------------------------------------
update public.billing_subscriptions bs
set property_id = sub.property_id
from (
  select distinct on (p.org_id) p.org_id, p.id as property_id
  from public.properties p
  order by p.org_id, p.created_at asc
) sub
where bs.org_id = sub.org_id
  and bs.property_id is null;

-- Refuse to silently delete rows that still reference a live Stripe
-- subscription — that would orphan a sub that's still billing the
-- customer. Operators must cancel or reassign such rows manually before
-- re-running the migration. Rows with no stripe_subscription_id are
-- safe to drop (they're stale placeholders from earlier failed flows).
do $$
declare
  active_orphans int;
begin
  select count(*) into active_orphans
  from public.billing_subscriptions
  where property_id is null
    and stripe_subscription_id is not null;
  if active_orphans > 0 then
    raise exception
      'billing_subscriptions has % row(s) with a stripe_subscription_id '
      'but no property to attach to. Cancel or reassign these in Stripe '
      'and update the DB before re-running this migration.',
      active_orphans;
  end if;
end$$;

delete from public.billing_subscriptions
where property_id is null;

-- ----------------------------------------------------------------------------
-- 3. Swap the primary key from org_id to property_id.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'billing_subscriptions_pkey'
      and conrelid = 'public.billing_subscriptions'::regclass
  ) then
    alter table public.billing_subscriptions
      drop constraint billing_subscriptions_pkey;
  end if;
end$$;

alter table public.billing_subscriptions
  alter column property_id set not null;

alter table public.billing_subscriptions
  add constraint billing_subscriptions_pkey primary key (property_id);

-- org_id is no longer unique on this table — make sure the FK + index exist
-- so the org-scoped lookups in code and RLS stay fast.
create index if not exists billing_subscriptions_org_id_idx
  on public.billing_subscriptions(org_id);

-- The existing select policy keys off org_id, which is still on the row, so
-- RLS keeps working unchanged. No policy edits needed here.

-- PostgREST schema cache reload so the new column is visible immediately.
notify pgrst, 'reload schema';
