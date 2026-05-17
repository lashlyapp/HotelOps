-- Drop the legacy send-invoice grace deadline column. Every subscription is
-- now created on collection_method=charge_automatically with a payment method
-- on file, so there is no longer a cooling-period deadline to track.
alter table billing_subscriptions
  drop column if exists payment_method_due_at;
