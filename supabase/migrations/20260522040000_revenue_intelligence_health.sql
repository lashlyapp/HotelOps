-- Revenue Intelligence — source-health alert plumbing.
-- One column on data_source_registry tracks when we last alerted on
-- a failing source so the hourly health cron doesn't spam platform
-- admins with the same warning every hour.

alter table public.data_source_registry
  add column if not exists last_health_alert_at timestamptz;

comment on column public.data_source_registry.last_health_alert_at is
  'Most recent platform-admin alert sent for this source being unhealthy. Used by /api/cron/source-health-check to dedupe — re-alert at most once per 24h while the source stays broken.';
