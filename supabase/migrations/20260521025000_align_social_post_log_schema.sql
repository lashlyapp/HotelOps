-- Catch-up: align the remote `social_post_log` and
-- `property_social_settings` schemas with what the local
-- `20260520010000_social_post_assistant.sql` file currently
-- describes.
--
-- Backstory: commit e935431 ("Make Social Studio a paid add-on with
-- system-only daily generation") rewrote the body of the already-
-- applied 20260520010000 migration to (a) add `post_date` +
-- `unique (property_id, post_date)` to social_post_log, (b) reindex
-- on post_date instead of created_at, and (c) drop
-- property_social_settings.openai_api_key_enc. Supabase tracks
-- applied migrations by filename, not content hash, so the remote
-- kept the pre-e935431 schema and the new code paths
-- (api/cron/social-daily-posts upserting on post_date) have been
-- silently failing in production ever since.
--
-- This migration replays the e935431 schema delta as a real,
-- separately-tracked migration so the remote catches up without
-- having to surgically rewrite migration history. After it runs the
-- next migration in the series (20260521030000_social_vision_tags_
-- and_dedupe) — which references social_post_log.post_date in a new
-- partial index — applies cleanly.
--
-- Idempotent and defensive everywhere: nothing here will fail on a
-- fresh database where 20260520010000's new shape was applied
-- directly, and nothing here will fail on a re-run if a partial
-- previous attempt got further than expected.

-- ---------------------------------------------------------------------------
-- 1. social_post_log.post_date — required by the daily upsert and by
--    the new vision-tags migration's partial index.
-- ---------------------------------------------------------------------------
alter table public.social_post_log
  add column if not exists post_date date;

-- Backfill from created_at for any pre-existing rows. The remote's
-- cron has been failing since e935431 (it tries to write post_date
-- against a column that doesn't exist), so in practice this table is
-- expected to be empty in prod — but the backfill is harmless either
-- way.
update public.social_post_log
  set post_date = created_at::date
  where post_date is null;

-- Now safe to enforce NOT NULL. Wrapped so re-runs don't error if the
-- constraint is already in place (the duplicate-set is fine in
-- Postgres but we mirror the rest of this file's defensive style).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'social_post_log'
      and column_name = 'post_date'
      and is_nullable = 'YES'
  ) then
    alter table public.social_post_log
      alter column post_date set not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. unique (property_id, post_date) — the cron's upsert keys off this.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.social_post_log'::regclass
      and conname = 'social_post_log_property_id_post_date_key'
  ) then
    alter table public.social_post_log
      add constraint social_post_log_property_id_post_date_key
      unique (property_id, post_date);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Replace the property-only index with the post_date one the local
--    file describes. The old index was (property_id, created_at desc);
--    queries now go through (property_id, post_date desc) so the
--    /social page reader is a single index lookup.
-- ---------------------------------------------------------------------------
drop index if exists public.social_post_log_property_idx;
create index if not exists social_post_log_property_idx
  on public.social_post_log(property_id, post_date desc);

-- ---------------------------------------------------------------------------
-- 4. property_social_settings.openai_api_key_enc — removed when
--    Social Studio became a paid add-on (the platform key is used
--    instead of per-property keys). Drop only if it still exists on
--    the remote.
-- ---------------------------------------------------------------------------
alter table public.property_social_settings
  drop column if exists openai_api_key_enc;

comment on table public.social_post_log is
  'One row per property per day, written by the /api/cron/social-daily-posts job. Drives topic rotation (avoid the last few days) and the "recent posts" timeline.';
