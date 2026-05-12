-- Align billing_subscriptions with the columns the app code expects.
--
-- Some environments (notably the myhotelops Supabase project) ended up with
-- a 14-column billing_subscriptions table that's missing several fields the
-- Stripe-mirror upsert in src/lib/stripe/subscriptions.ts and the bootstrap
-- script in scripts/start-subscription.ts both write — most visibly
-- `currency`, which surfaced as a PGRST204 "Could not find the 'currency'
-- column of 'billing_subscriptions' in the schema cache" when running the
-- start-subscription workflow.
--
-- This migration is intentionally additive and idempotent: every alteration
-- uses `if not exists` (or guarded DO blocks for objects that don't support
-- that clause), so it's safe to apply against a DB that already has the
-- columns from 20260509030000_billing_subscriptions.sql as well as one
-- where they're missing.
--
-- Pre-existing columns not declared by the canonical schema (e.g. legacy
-- `trial_end`) are left in place — dropping them is out of scope for an
-- alignment migration.

-- Enum type: create only if missing.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'billing_subscription_status') then
    create type public.billing_subscription_status as enum (
      'trialing',
      'active',
      'past_due',
      'unpaid',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'paused'
    );
  end if;
end$$;

-- Columns. `add column if not exists` is a no-op when the column is already
-- present, including matching its default; existing rows get the default
-- filled for the newly-added not-null columns.
alter table public.billing_subscriptions
  add column if not exists stripe_price_id text,
  add column if not exists status public.billing_subscription_status not null default 'incomplete',
  add column if not exists payment_method_due_at timestamptz,
  add column if not exists past_due_since timestamptz,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists unit_amount_cents integer,
  add column if not exists quantity integer not null default 1,
  add column if not exists currency text not null default 'usd',
  add column if not exists default_payment_method_id text,
  add column if not exists default_payment_brand text,
  add column if not exists default_payment_last4 text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- quantity check constraint. `add constraint` has no `if not exists` clause,
-- so we guard it with a catalog lookup.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_subscriptions_quantity_check'
      and conrelid = 'public.billing_subscriptions'::regclass
  ) then
    alter table public.billing_subscriptions
      add constraint billing_subscriptions_quantity_check check (quantity >= 0);
  end if;
end$$;

-- Indexes.
create index if not exists billing_subscriptions_status_idx
  on public.billing_subscriptions(status);
create index if not exists billing_subscriptions_customer_idx
  on public.billing_subscriptions(stripe_customer_id);

-- RLS + select policy.
alter table public.billing_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_subscriptions'
      and policyname = 'billing_subscriptions_select_org'
  ) then
    create policy billing_subscriptions_select_org
      on public.billing_subscriptions for select
      using (org_id = public.current_org_id() or public.is_platform_admin());
  end if;
end$$;

-- PostgREST schema cache reload so the new columns are visible to the API
-- immediately, without waiting for the next automatic reload.
notify pgrst, 'reload schema';
