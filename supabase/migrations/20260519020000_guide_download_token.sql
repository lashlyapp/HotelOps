-- Per-lead download token for the gated guide PDF. The route handler
-- at /api/blog/guide-download verifies this token before streaming
-- the file, so the artifact stops being trivially discoverable via
-- /public/<filename>. Each lead row generates one stable token on
-- insert and can be revisited by the same lead (e.g. via the email
-- they were sent) without re-submitting the form.

alter table public.guide_leads
  add column download_token uuid not null default gen_random_uuid();

alter table public.guide_leads
  add column download_count integer not null default 0;

alter table public.guide_leads
  add column last_downloaded_at timestamptz;

create unique index guide_leads_download_token_idx
  on public.guide_leads(download_token);

comment on column public.guide_leads.download_token is
  'Unguessable UUID used as the path-token for /api/blog/guide-download. Generated server-side on insert; only ever exposed via the success-page download URL and the lead-delivery email.';
comment on column public.guide_leads.download_count is
  'Number of times the lead has hit /api/blog/guide-download with this token. Bumped on each verified hit; useful for abuse monitoring and lifecycle analytics (re-download = renewed interest).';
