-- Drop the legacy check-payment invoices table. v1 billed by mailed check
-- and tracked invoices in this table; v2 is Stripe-only — subscriptions live
-- in billing_subscriptions, invoices are fetched live from the Stripe API
-- via lib/stripe/subscriptions.listStripeInvoices and never persisted.

drop policy if exists invoices_select_org on public.invoices;
drop table if exists public.invoices;
drop type if exists public.invoice_status;
