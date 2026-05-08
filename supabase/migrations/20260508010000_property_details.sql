-- Property detail fields (address, contact, branding).
-- Slug + r2_prefix stay as identifiers; everything else here is editable
-- by the tenant owner from the property edit form.

alter table public.properties
  add column address_line1 text,
  add column address_line2 text,
  add column city text,
  add column state text,
  add column postal_code text,
  add column country text not null default 'US',
  add column phone text,
  add column email text,
  add column website text,
  add column description text,
  add column logo_key text,
  add column logo_uploaded_at timestamptz;
