-- "Today's post" generator: helps the GM publish to their hotel's
-- social channels without us touching any social platform API. The
-- app suggests a topic + caption + image; the GM copies/downloads
-- and posts manually from their phone.
--
-- Two tables:
--
--   property_social_settings — one row per property. Holds the brand
--     voice, an (optionally) AES-encrypted OpenAI API key, signature
--     hashtags, and the public-facing social handles we mention in
--     captions. Encryption reuses SIGNUP_ENCRYPTION_KEY via
--     src/lib/crypto/aes.ts — same envelope format, different
--     payload. If the key is rotated, GMs re-enter their OpenAI key
--     (same blast-radius story as in-flight signups).
--
--   social_post_log — append-only history of generated posts. Drives
--     the "don't repeat yesterday's topic" rotation in
--     src/app/(app)/social/_lib/topics.ts and gives the GM a "what
--     have I posted recently" timeline. We keep the actual caption
--     text so the GM can re-copy a past post without regenerating.

-- ---------------------------------------------------------------------------
-- 1. Per-property settings
-- ---------------------------------------------------------------------------
create table public.property_social_settings (
  property_id uuid primary key references public.properties(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- One of: warm, luxury, boutique, family, casual, playful. Kept as
  -- text rather than an enum so we can add voices without a migration.
  brand_voice text not null default 'warm',
  -- AES-256-GCM(IV || ciphertext || authTag), base64. Null when the GM
  -- has not configured a key — caption generation falls back to a
  -- template path in that case.
  openai_api_key_enc text,
  -- Free-form: "#boutiquehotel #santabarbara". Appended to every
  -- generated caption when set.
  signature_hashtags text,
  -- Display-only: "@blueheronhotel". The generator references this so
  -- captions that mention the hotel use the correct handle.
  social_handles text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index property_social_settings_org_idx
  on public.property_social_settings(org_id);

alter table public.property_social_settings enable row level security;

create policy property_social_settings_select_org
  on public.property_social_settings for select
  using (
    public.is_platform_admin() or
    exists (
      select 1
      from public.properties p
      where p.id = property_social_settings.property_id
        and p.org_id = public.current_org_id()
    )
  );

-- Writes happen via service role from server actions; no INSERT/UPDATE
-- policies needed for v1.

comment on table public.property_social_settings is
  'Per-property configuration for the social post generator (brand voice, encrypted OpenAI key, hashtags). One row per property; missing row = defaults.';
comment on column public.property_social_settings.openai_api_key_enc is
  'AES-256-GCM ciphertext (IV||ct||tag, base64) of the GM-provided OpenAI key. Encrypted under SIGNUP_ENCRYPTION_KEY via src/lib/crypto/aes.ts. Null means "no key configured — use template fallback".';

-- ---------------------------------------------------------------------------
-- 2. Post history
-- ---------------------------------------------------------------------------
create table public.social_post_log (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- The topic key the rotation picked (e.g. 'staff_spotlight', 'weather_mood').
  -- Used to bias future picks away from recent topics.
  topic text not null,
  -- The caption the GM saw. We log all variants the generator returned
  -- as a JSON array so a re-copy works without regeneration.
  captions jsonb not null,
  -- Parallel array (same length as `captions`) of AI-suggested
  -- hashtag sets per variant. The GM-configured "signature hashtags"
  -- live on property_social_settings and are NOT duplicated here —
  -- they're always appended at copy/email time, regardless of which
  -- variant was posted.
  hashtag_sets jsonb not null default '[]'::jsonb,
  -- R2 key of the suggested image, if any.
  media_key text,
  -- Stamped when the GM hits "copy" or "email me" — purely
  -- informational; the row exists from generation time.
  marked_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index social_post_log_property_idx
  on public.social_post_log(property_id, created_at desc);

alter table public.social_post_log enable row level security;

create policy social_post_log_select_org
  on public.social_post_log for select
  using (
    public.is_platform_admin() or
    exists (
      select 1
      from public.properties p
      where p.id = social_post_log.property_id
        and p.org_id = public.current_org_id()
    )
  );

comment on table public.social_post_log is
  'Append-only history of generated social posts. Drives topic rotation (avoid recent topics) and a "recent posts" timeline for the GM.';

-- ---------------------------------------------------------------------------
-- 3. Caption feedback (RLHF-lite for the brand voice)
-- ---------------------------------------------------------------------------
-- Each generated caption variant gets thumbs-up / thumbs-down buttons.
-- We log the vote against the actual caption text (not just an id)
-- because the generator feeds a sample of recent likes/dislikes back
-- into the prompt: "captions that have worked for this property look
-- like A, B, C; ones that haven't look like X, Y." Over time the
-- model learns each property's preferences without us shipping a
-- per-tenant fine-tune.

create table public.social_caption_feedback (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- The exact caption text the GM saw, frozen. Used verbatim as a
  -- few-shot example in subsequent prompts.
  caption text not null,
  -- The topic the caption was generated under. Lets us pull
  -- topic-relevant examples first when biasing the prompt.
  topic text not null,
  -- True = liked, false = disliked. The actor can change their mind
  -- by clicking the other button; the action upserts on (property,
  -- caption).
  liked boolean not null,
  voter_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, caption)
);

create index social_caption_feedback_property_idx
  on public.social_caption_feedback(property_id, liked, created_at desc);

alter table public.social_caption_feedback enable row level security;

create policy social_caption_feedback_select_org
  on public.social_caption_feedback for select
  using (
    public.is_platform_admin() or
    exists (
      select 1
      from public.properties p
      where p.id = social_caption_feedback.property_id
        and p.org_id = public.current_org_id()
    )
  );

comment on table public.social_caption_feedback is
  'Thumbs-up/down votes on individual generated captions. Recent votes are sampled into the next generation prompt so the model picks up each property''s brand voice over time.';
