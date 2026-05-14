-- Login attempt log + indexes for per-IP / per-email rate limiting.
--
-- One row per attempt — including successes, so we can wipe the
-- failure history once a user authenticates correctly (otherwise a
-- successful login wouldn't reset the counter and the user could lock
-- themselves out after a normal session that started with a typo).
--
-- We intentionally don't store the password or any token — only the
-- inputs needed to throttle further requests from the same IP or
-- against the same email. Old rows are pruned by a periodic cleanup
-- (or trivially by `delete from login_attempts where created_at < now() - interval '1 day'`
-- on a schedule).
--
-- RLS: deny everything to the anon / authed clients. Only the
-- service-role admin client (used in the server action) touches it.

create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip_address inet,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_email_created_idx
  on public.login_attempts (lower(email), created_at desc)
  where succeeded = false;
create index if not exists login_attempts_ip_created_idx
  on public.login_attempts (ip_address, created_at desc)
  where succeeded = false;

alter table public.login_attempts enable row level security;

-- No policies: every client other than the service-role bypass key is
-- denied by default once RLS is enabled.
