-- "Today's post" generator (Social Studio add-on): the system drafts
-- one post per property per day so the GM never has to think about
-- what to publish. Generation runs from a Vercel cron — there is no
-- user-initiated regeneration, which keeps per-property AI cost
-- bounded ("use it or lose it"). The OpenAI key lives in a single
-- platform-wide env var; tenants do not provide one.
--
-- Three tables:
--
--   property_social_settings — one row per property. Brand voice,
--     signature hashtags appended to every caption, and the public
--     social handle the generator references when natural.
--
--   social_post_log — one row per (property, post_date). The cron
--     upserts via that uniqueness, so a retry within the same day
--     never produces a second post. Stores all three caption
--     variants + parallel AI-suggested hashtag sets + a media key,
--     so the page is a pure reader.
--
--   social_caption_feedback — thumbs-up/down votes folded back into
--     the next day's prompt as positive / negative few-shot
--     examples.

-- ---------------------------------------------------------------------------
-- 1. Per-property settings
-- ---------------------------------------------------------------------------
create table public.property_social_settings (
  property_id uuid primary key references public.properties(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- One of: warm, luxury, boutique, family, casual, playful. Kept as
  -- text rather than an enum so we can add voices without a migration.
  brand_voice text not null default 'warm',
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
  'Per-property configuration for the social post generator: brand voice, signature hashtags, social handle. One row per property; missing row = defaults.';

-- ---------------------------------------------------------------------------
-- 2. Generated posts (one per property per day)
-- ---------------------------------------------------------------------------
create table public.social_post_log (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- The day this post was generated for. The cron upserts on
  -- (property_id, post_date) so a retry within the same UTC day
  -- never produces a second post, and the page query is a single
  -- index lookup.
  post_date date not null,
  -- The topic key the rotation picked (e.g. 'staff_spotlight', 'weather_mood').
  -- Used to bias future picks away from recent topics.
  topic text not null,
  -- The three caption variants the generator produced.
  captions jsonb not null,
  -- Parallel array (same length as `captions`) of AI-suggested
  -- hashtag sets per variant. The GM-configured "signature hashtags"
  -- live on property_social_settings and are NOT duplicated here —
  -- they're always appended at copy/email time, regardless of which
  -- variant was posted.
  hashtag_sets jsonb not null default '[]'::jsonb,
  -- R2 key of the suggested image, if any.
  media_key text,
  -- Stamped when the GM hits "Mark as posted". Purely informational;
  -- the row exists from generation time. Drives the "you've already
  -- posted today" indicator and a campaign-style adoption metric.
  marked_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (property_id, post_date)
);

create index social_post_log_property_idx
  on public.social_post_log(property_id, post_date desc);

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
  'One row per property per day, written by the /api/cron/social-daily-posts job. Drives topic rotation (avoid the last few days) and the "recent posts" timeline.';

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
