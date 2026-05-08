-- Add a poster_key column to media_metadata. For videos, we generate a
-- still-frame JPEG client-side at upload time and store it as a sibling R2
-- object; the catalog card renders that static image instead of mounting a
-- <video preload="metadata"> element, so cards no longer re-fetch metadata
-- ranges on every page entry.

alter table public.media_metadata
  add column if not exists poster_key text;
