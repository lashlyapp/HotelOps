-- Social Studio: vision-tagging + recent-use dedupe.
--
-- The old generator picked a topic, then chose a photo and a caption
-- separately. The caption prompt only received the photo's filename
-- or Unsplash alt-text — meaning the caption could (and routinely
-- did) talk about a terrace while the photo was a bedroom. The new
-- generator pivots on three additions:
--
--   1. Vision-tag the property's own media catalog at upload time so
--      pickMediaForTopic has real "what is in this photo" data to
--      match against the topic, and so the caption prompt can
--      describe what's actually in the frame instead of guessing
--      from a filename.
--
--   2. Persist the Unsplash photo id (not just the URL) on
--      social_post_log so the next day's selection can skip recently-
--      used photos and avoid the "you posted that pool shot again"
--      embarrassment.
--
-- All additive, idempotent. Existing rows / files keep working —
-- vision_tags defaults to empty and the generator's matching path
-- treats an empty array the same as today (falls through to
-- filename/description), so the deploy is safe even before any
-- backfill runs.

-- ---------------------------------------------------------------------------
-- 1. Vision tags on media_metadata
-- ---------------------------------------------------------------------------
alter table public.media_metadata
  add column if not exists vision_description text,
  add column if not exists vision_tags text[] not null default '{}',
  add column if not exists vision_tagged_at timestamptz;

comment on column public.media_metadata.vision_description is
  'One-sentence description of what is in the image, produced by a vision model (OpenAI gpt-4o-mini). Fed into the social-caption prompt so the LLM writes captions about the actual photo, not the topic in abstract. Null until the image has been analyzed.';

comment on column public.media_metadata.vision_tags is
  'Normalized lowercase tags describing what is in the image (e.g. ["terrace", "morning_light", "coffee", "two_chairs"]). Produced by the same vision pass that populates vision_description. Used by pickMediaForTopic in the social generator alongside the user-applied media_tags. Empty by default so existing rows keep working.';

comment on column public.media_metadata.vision_tagged_at is
  'When the vision pass last ran on this image. Lets the backfill cron pick up rows that pre-date the feature, and lets us re-tag if we change the vision prompt later.';

-- ---------------------------------------------------------------------------
-- 2. Unsplash recent-use dedupe on social_post_log
-- ---------------------------------------------------------------------------
alter table public.social_post_log
  add column if not exists external_media_id text;

comment on column public.social_post_log.external_media_id is
  'When external_media_url is from Unsplash, the Unsplash photo id (stable across renders). Used by the next day''s generator to exclude photos used in the last 30 days for this property — prevents the same pool/terrace stock photo from cycling back week-over-week.';

-- Lookup index for the dedupe query (property + recency). Partial so
-- it only covers Unsplash rows; catalog posts aren't deduped this way.
create index if not exists social_post_log_external_media_recent_idx
  on public.social_post_log (property_id, post_date desc)
  where external_media_id is not null;
