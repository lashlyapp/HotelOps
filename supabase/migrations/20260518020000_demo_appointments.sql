-- Persistent record of every confirmed /demo booking.
--
-- Up until this migration, verifyDemoBookingOtp emailed the
-- founder + visitor and then deleted the pending row. Nothing was
-- stored. That made the inbox the entire CRM — which is fine at
-- two bookings a week but unusable for tracking outcomes,
-- reporting CAC payback, or noticing that the same prospect
-- already booked once and ghosted.
--
-- After this migration:
--   - verifyDemoBookingOtp inserts here as the final step (in
--     addition to sending the emails).
--   - /admin/appointments reads this table to render list +
--     calendar views.
--   - status starts at 'scheduled'; the admin transitions it to
--     'completed' / 'no_show' / 'cancelled' from the UI.

create table public.demo_appointments (
  id uuid primary key default gen_random_uuid(),

  -- Identity copied from demo_bookings_pending on verify. These
  -- fields are intentionally denormalized — there's no FK to
  -- demo_bookings_pending (that row is deleted on verify) and the
  -- visitor isn't a user in our auth system.
  visitor_email text not null,
  visitor_name text not null,
  hotel_name text not null,
  property_count text,
  visitor_notes text,
  preferred_language text not null
    check (preferred_language in ('en', 'es', 'ko', 'vi')),
  visitor_locale text not null,

  -- Slot id from buildDemoSlotDays — kept for round-tripping into
  -- parseSlotId. slot_at is the parsed UTC timestamp (assumed PT
  -- of the founder's clock; conversion lives in the action that
  -- inserts here, not the DB). slot_at is what the admin UI sorts,
  -- groups, and filters by, so it's indexed.
  slot_id text not null,
  slot_at timestamptz not null,

  -- Admin-controlled state. Starts at 'scheduled' on insert.
  --   - completed: call happened, founder marked done
  --   - no_show:   call time passed, visitor didn't show
  --   - cancelled: visitor or founder cancelled before the time
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'no_show', 'cancelled')),

  -- Internal-only follow-up notes written by the founder after
  -- the call. Distinct from visitor_notes (what the visitor
  -- typed in the booking form, never edited).
  admin_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Calendar view groups by day; list view sorts by upcoming time;
-- both want slot_at as the lead index column.
create index demo_appointments_slot_at_idx
  on public.demo_appointments(slot_at);

-- Status filters in the list view ("upcoming only", "show no-shows")
-- and dashboard counts benefit from a partial-status index but the
-- table is small enough that a simple index suffices.
create index demo_appointments_status_idx
  on public.demo_appointments(status);

-- Auto-update updated_at on every modification so the list view
-- can show "edited X ago" without app-level plumbing. Reuses the
-- pattern from elsewhere in the schema.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger demo_appointments_set_updated_at
  before update on public.demo_appointments
  for each row execute function public.set_updated_at();

alter table public.demo_appointments enable row level security;
-- No public RLS policies → service-role only. Admin actions all
-- run through createAdminClient(); regular tenant users have no
-- reason to see this table.

comment on table public.demo_appointments is
  'Confirmed /demo bookings. Inserted by verifyDemoBookingOtp once the visitor enters the right code. Read by the admin appointments page (list + calendar views). Lifecycle is admin-driven from "scheduled" through "completed"/"no_show"/"cancelled".';
comment on column public.demo_appointments.slot_at is
  'UTC timestamp parsed from slot_id at insert time. Assumes the slot hour represents the founder''s clock (US Pacific). Source of truth for sorting and calendar grouping; slot_id is kept alongside for display formatting.';
