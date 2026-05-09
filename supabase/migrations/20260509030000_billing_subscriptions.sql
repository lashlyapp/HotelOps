-- Stripe-backed subscriptions per organization. v1 model: one Stripe Customer
-- and one Subscription per org. Trial period covers the 14-day cooling window
-- between admin onboarding and the first charge — during the trial the org
-- has no payment method and the billing page shows a CTA to add one.
--
-- The legacy `invoices` table from the initial schema stays as-is for
-- check-payment history; new recurring billing flows through Stripe.

-- ----------------------------------------------------------------------------
-- billing_subscriptions: 1:1 with organizations.
-- ----------------------------------------------------------------------------
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

create table public.billing_subscriptions (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status public.billing_subscription_status not null default 'incomplete',
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Snapshot of the default card on file. Refreshed via webhook so we can
  -- render "Visa ending 4242" without a Stripe round-trip per page load.
  default_payment_method_id text,
  default_payment_brand text,
  default_payment_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_subscriptions_status_idx
  on public.billing_subscriptions(status);
create index billing_subscriptions_customer_idx
  on public.billing_subscriptions(stripe_customer_id);

-- ----------------------------------------------------------------------------
-- stripe_events: idempotency log for webhook deliveries. Stripe may redeliver
-- the same event after transient failures; we ignore duplicates by event id.
-- ----------------------------------------------------------------------------
create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  payload jsonb
);

create index stripe_events_received_at_idx
  on public.stripe_events(received_at desc);

-- ----------------------------------------------------------------------------
-- RLS: org members read their own org's subscription; writes are service-role
-- only (driven by webhooks and admin scripts).
-- ----------------------------------------------------------------------------
alter table public.billing_subscriptions enable row level security;
alter table public.stripe_events enable row level security;

create policy billing_subscriptions_select_org
  on public.billing_subscriptions for select
  using (org_id = public.current_org_id() or public.is_platform_admin());

-- stripe_events is admin-only; no select policy for tenants.
