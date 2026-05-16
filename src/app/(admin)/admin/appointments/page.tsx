import { requirePlatformAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppointmentsClient } from './_components/appointments-client'

/**
 * Demo-appointment management page. Server-fetches every appointment
 * (table is small — single-digit per day even at peak), passes the
 * full list to a client component that renders the list/calendar
 * toggle + detail panel.
 *
 * Sort: ascending by slot_at so the immediate next appointment is
 * at the top. The client splits the list into "upcoming" and
 * "past" sections; the calendar view filters by visible week.
 */
export default async function AdminAppointmentsPage() {
  await requirePlatformAdmin()
  const appointments = await loadAppointments()

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Appointments
        </h1>
        <p className="mt-1 text-sm text-muted">
          {appointments.length === 0
            ? 'No demo bookings yet.'
            : `${appointments.length} booking${appointments.length === 1 ? '' : 's'} across all statuses.`}
        </p>
      </div>

      <AppointmentsClient appointments={appointments} />
    </div>
  )
}

export type AppointmentRow = {
  id: string
  visitor_email: string
  visitor_name: string
  hotel_name: string
  property_count: string | null
  visitor_notes: string | null
  preferred_language: 'en' | 'es' | 'ko' | 'vi'
  visitor_locale: string
  slot_id: string
  slot_at: string
  status: 'scheduled' | 'completed' | 'no_show' | 'cancelled'
  admin_notes: string | null
  created_at: string
  updated_at: string
}

async function loadAppointments(): Promise<AppointmentRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('demo_appointments')
    .select(
      'id, visitor_email, visitor_name, hotel_name, property_count, visitor_notes, preferred_language, visitor_locale, slot_id, slot_at, status, admin_notes, created_at, updated_at',
    )
    .order('slot_at', { ascending: true })

  if (error) {
    console.error('[admin] loadAppointments failed', error)
    return []
  }
  return (data ?? []) as AppointmentRow[]
}
