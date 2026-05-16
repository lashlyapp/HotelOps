-- Optional Unsplash media on generated posts.
--
-- The daily cron picks photos from the property's media catalog by
-- default, but two scenarios benefit from going outside:
--
--   1. A new "Nearby landmarks" topic — the GM doesn't have photos
--      of the cathedral down the street, but Unsplash does. This
--      topic always uses an Unsplash image.
--
--   2. Catalog fatigue — properties that haven't uploaded many
--      photos start cycling the same ten images. Every fifth
--      generation, the cron falls back to a topic-appropriate
--      Unsplash photo (travel / airport / terrace / destination)
--      to keep the feed fresh.
--
-- Storage: we DO NOT mirror Unsplash images into R2. Their CDN is
-- already fast, their license permits hotlinking from API consumers,
-- and pulling images into R2 would burn storage that the operator
-- pays for via the per-property quota. The post log keeps the
-- public URL + photographer attribution; the UI renders it directly
-- and the GM downloads from the same URL when they decide to post.
--
-- Attribution: Unsplash's API guidelines require us to credit the
-- photographer in our UI when we display their photo, and to ping
-- their download-tracking endpoint when the photo is "used". The
-- cron pings the tracker; the UI renders "Photo by X on Unsplash"
-- under the suggested image. The downstream social-platform post
-- (which the GM publishes themselves) is not required to carry
-- attribution under the Unsplash license, but the GM can add a
-- credit hashtag if they want.

alter table public.social_post_log
  add column if not exists external_media_url text,
  add column if not exists external_media_credit jsonb;

comment on column public.social_post_log.external_media_url is
  'When set, the suggested image came from an external source (Unsplash today). Full https URL; rendered directly by the page and the email action. Mutually exclusive with media_key (which holds R2 keys for the property''s own media catalog).';
comment on column public.social_post_log.external_media_credit is
  'Attribution metadata for the external image, shape: { source, photographer_name, photographer_url, source_url }. Required by the Unsplash API guidelines whenever external_media_url is set; the UI renders it as "Photo by {name} on {source}".';
