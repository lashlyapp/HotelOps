-- User-profile contact + bio fields.
--
-- Up to now `profiles` only carried full_name. The /account page lumped
-- the user's identity (email, role) together with org-level info (org
-- name, properties), and there was no in-product way for a user to update
-- their own contact details after signup.
--
-- This migration adds the standard self-serve profile fields used across
-- the /account UI:
--   - phone   : free-form contact number (no E.164 enforcement; users put
--               in extensions, country codes, etc. however they like).
--   - title   : job title (e.g. "GM", "Front desk lead") so the Team
--               page can surface it next to the user's name.
--   - bio     : short free-form description shown on the profile card.
--
-- Email is intentionally NOT on this table — it lives on auth.users and
-- changes go through Supabase's confirmation flow (auth.updateUser).
-- Mirroring it here would mean keeping two sources of truth in sync.
--
-- All three columns are nullable and require no backfill: existing users
-- simply have nulls until they fill them in.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists title text,
  add column if not exists bio text;

-- Soft length floors so the columns don't accumulate junk via an
-- accidentally-unbounded textarea. Generous enough to not pinch real
-- input (a bio is a sentence or two, not a memoir).
alter table public.profiles
  add constraint profiles_phone_length check (phone is null or char_length(phone) <= 40),
  add constraint profiles_title_length check (title is null or char_length(title) <= 120),
  add constraint profiles_bio_length   check (bio   is null or char_length(bio)   <= 600);

notify pgrst, 'reload schema';
