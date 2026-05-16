-- Capture UTM parameters and the visitor's source through the signup
-- funnel so paid-acquisition campaigns are attributable.
--
-- The visitor lands on /signup (or any marketing page) with query
-- params like ?utm_source=meta&utm_medium=cpc&utm_campaign=may-eu&utm_content=ad-3.
-- We store those on signup_pending at OTP-request time, copy them
-- onto the org row at OTP-verify time, and they live forever as the
-- "where did this customer come from" attribution.
--
-- Without this, the admin dashboard can show the conversion funnel
-- but can't tell *which campaign* drove which conversion — you'd
-- know your CAC in aggregate but not per ad.

alter table public.signup_pending
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists referrer text;

alter table public.organizations
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists referrer text;

-- Indexes for the eventual /admin "campaign performance" view —
-- "show me every org that came from utm_campaign='may-eu'". Partial
-- so we don't bloat the index with the (long) tail of nulls.
create index if not exists organizations_utm_campaign_idx
  on public.organizations(utm_campaign)
  where utm_campaign is not null;
create index if not exists organizations_utm_source_idx
  on public.organizations(utm_source)
  where utm_source is not null;

comment on column public.organizations.utm_source is
  'Where the visitor came from (meta, google, linkedin, hackernews, …). Captured at signup from the URL query string and persisted forever as attribution. Used by the admin dashboard to compute per-channel CAC and conversion rates.';
comment on column public.organizations.utm_campaign is
  'Specific campaign name (e.g. "may-eu-launch", "evergreen-owner-pers-3"). Drives the per-campaign attribution view in /admin.';
