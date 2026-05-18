-- Optional 1-on-1 onboarding session opt-in.
--
-- The free-trial workflow walks new teams through setup, so onboarding
-- assistance is no longer the default. The historical behavior — every
-- new property's first invoice carries a one-time setup fee — is being
-- inverted to opt-in: the fee is only attached when the customer
-- explicitly asks for a one-hour 1-on-1 session with our team at
-- sign-up.
--
-- Data model:
--   - organizations.wants_onboarding_session captures the customer's
--     intent at signup. False by default for everyone (including
--     existing tenants, who already started without the session).
--     Admins can flip this from /admin/tenants/[id] if a customer
--     calls in and asks to book the session after the fact.
--   - organizations.onboarding_fee_invoiced_at is stamped optimistically
--     when start-subscription / setup-checkout attaches the
--     hotelops_setup_fee line item to a sub. Used to dedupe across
--     properties so the fee never re-attaches if the customer adds a
--     second property later or cancels-then-resubscribes.
--   - signup_pending.wants_onboarding_session carries the opt-in across
--     the OTP gap (the column flows from the signup form → pending row
--     → organizations row when the OTP is verified).
--
-- The Stripe Price (lookup key `hotelops_setup_fee`) is unchanged — it
-- stays managed in the Stripe Dashboard. The gating moves into our
-- code: a tenant with wants_onboarding_session=false silently omits
-- the line item regardless of whether the Price is active.

alter table public.organizations
  add column if not exists wants_onboarding_session boolean not null default false,
  add column if not exists onboarding_fee_invoiced_at timestamptz;

comment on column public.organizations.wants_onboarding_session is
  'True when the customer opted in to a one-hour 1-on-1 onboarding session at signup. Gates the one-time setup fee on the first property invoice. False by default — the free trial walks most teams through setup so the session (and its fee) is opt-in.';

comment on column public.organizations.onboarding_fee_invoiced_at is
  'Stamped optimistically the first time start-subscription / setup-checkout attaches the hotelops_setup_fee line item to a property subscription for this org. Used to dedupe so the fee is never attached twice across properties or after a cancel-and-resubscribe.';

alter table public.signup_pending
  add column if not exists wants_onboarding_session boolean not null default false;

comment on column public.signup_pending.wants_onboarding_session is
  'Mirrors the checkbox on the /signup form. Copied onto the organizations row when the OTP is verified; the pending row is then deleted.';
