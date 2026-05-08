-- Drop Cloudflare Stream integration. Videos now live in R2 alongside images
-- as ordinary objects under each property's prefix; the cover image is
-- captured client-side at upload time (TikTok-style frame picker) and stored
-- as a sibling JPEG referenced by media_metadata.poster_key. With no Stream
-- UIDs to track separately, media_videos is no longer needed — the R2 object
-- listing already includes video keys, and media_metadata + media_tags key
-- off the same R2 file_key as images do.

drop table if exists public.media_videos;
