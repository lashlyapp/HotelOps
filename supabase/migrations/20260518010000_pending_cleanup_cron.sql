-- pg_cron sweep for expired OTP-pending rows.
--
-- Two tables — public.signup_pending and public.demo_bookings_pending —
-- accumulate one row per OTP-request attempt and only delete on
-- successful verify. Abandoned attempts (visitor closed the tab,
-- typed the wrong email, OTP expired) leave their row behind. At
-- our current volume that's slow growth, but it's still leak-
-- shaped — we have a clear "expired" predicate, so we should sweep.
--
-- Why pg_cron rather than an app-side cron: the predicate is a
-- single SQL DELETE; pulling it through an HTTP-triggered Next.js
-- route would add a deploy dependency for an operation that has no
-- business logic. pg_cron runs in-database, no auth surface to
-- maintain, and the schedule is a normal migration artifact.
--
-- Cadence: every hour at :07. Hourly is more than enough for the
-- expiry window (15 minutes) — a row never lives past expiry by
-- more than an hour, which doesn't matter functionally. The :07
-- offset spaces this away from any other top-of-hour jobs.

create extension if not exists pg_cron;

-- Drop existing job by name so re-running this migration on a
-- branch with an earlier version doesn't double-register.
do $$
begin
  perform cron.unschedule('sweep-pending-otp');
exception
  when others then null;
end $$;

select cron.schedule(
  'sweep-pending-otp',
  '7 * * * *',
  $cron$
    delete from public.signup_pending
      where expires_at < now() - interval '1 hour';
    delete from public.demo_bookings_pending
      where expires_at < now() - interval '1 hour';
  $cron$
);

comment on extension pg_cron is
  'In-database job scheduler. Currently used to sweep expired OTP-pending rows hourly; reservable for other low-frequency maintenance tasks. Jobs live in cron.job — list with `select * from cron.job`.';
