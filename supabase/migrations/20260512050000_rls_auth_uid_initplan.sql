-- Hoist auth.uid() into InitPlan so RLS on public.profiles doesn't
-- re-evaluate it per row. Calling auth.uid() directly inside a policy
-- expression makes Postgres run it for every row scanned; wrapping it
-- as `(select auth.uid())` turns the call into an InitPlan node that
-- runs once per query.
--
-- This is the same fix Supabase's own perf advisor recommends in its
-- "Auth RLS Initialization Plan" warning:
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- We drop + recreate because CREATE POLICY has no ALTER USING form.

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self
  on public.profiles for select
  using (id = (select auth.uid()) or public.is_platform_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
