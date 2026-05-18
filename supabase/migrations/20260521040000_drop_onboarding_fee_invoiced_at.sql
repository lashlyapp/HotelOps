-- Drop organizations.onboarding_fee_invoiced_at — no longer used.
--
-- The original onboarding-session model treated the $150 setup fee as
-- a one-time per-org charge: the fee attached to the first property's
-- first invoice, and onboarding_fee_invoiced_at gated subsequent
-- attaches so the customer was never re-charged when they added more
-- properties or resubscribed.
--
-- The product has switched to per-property pricing — every property
-- the customer spins up while opted in pays $150 on its own first
-- invoice. shouldAttachOnboardingFee now only checks
-- wants_onboarding_session, so the dedup column has no remaining
-- readers or writers in code.
--
-- Existing-customer protection: any org that has already been charged
-- under the old model (onboarding_fee_invoiced_at IS NOT NULL) was
-- explicitly told the fee would never re-attach. Flip those orgs to
-- wants_onboarding_session = false BEFORE dropping the column so the
-- next property they create doesn't pick up a surprise $150 line
-- item. They keep their existing subscriptions untouched (this update
-- doesn't touch Stripe — billing_subscriptions, invoices, and the
-- live subs in Stripe are unchanged). If a grandfathered customer
-- ever wants another consultant session, an admin can re-enable
-- wants_onboarding_session from /admin/tenants/[id].
update public.organizations
  set wants_onboarding_session = false
  where onboarding_fee_invoiced_at is not null
    and wants_onboarding_session = true;

alter table public.organizations
  drop column if exists onboarding_fee_invoiced_at;

-- Refresh the column comment so the new semantics are documented at
-- the schema level too.
comment on column public.organizations.wants_onboarding_session is
  'True when the customer opted in to 1-on-1 setup with our client consultant at signup. While enabled, the $150 hotelops_setup_fee line item is attached to every property''s first invoice (per-property pricing). False by default — the free trial walks most teams through setup.';
