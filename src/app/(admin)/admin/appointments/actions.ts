'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'

export type AppointmentStatus =
  | 'scheduled'
  | 'completed'
  | 'no_show'
  | 'cancelled'

const ALLOWED_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  'scheduled',
  'completed',
  'no_show',
  'cancelled',
])

export type UpdateAppointmentResult = { error?: string; ok?: boolean }

/**
 * Patch a single appointment's status + admin notes. Used by the
 * detail-pane on /admin/appointments and the quick-status menu on
 * the list view.
 *
 * Notes column is the founder's private follow-up channel — not
 * visible to the visitor and not exported in any pixel/CAPI event.
 */
export async function updateAppointment(
  _prev: UpdateAppointmentResult,
  formData: FormData,
): Promise<UpdateAppointmentResult> {
  await requirePlatformAdmin()

  const id = String(formData.get('id') ?? '').trim()
  const statusRaw = String(formData.get('status') ?? '').trim()
  const adminNotesRaw = String(formData.get('admin_notes') ?? '').trim()

  if (!id) return { error: 'Missing appointment id.' }
  if (!ALLOWED_STATUSES.has(statusRaw as AppointmentStatus)) {
    return { error: 'Invalid status.' }
  }
  if (adminNotesRaw.length > 2000) {
    return { error: 'Notes are too long (max 2000 characters).' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('demo_appointments')
    .update({
      status: statusRaw,
      admin_notes: adminNotesRaw || null,
    })
    .eq('id', id)

  if (error) {
    console.error('[admin] appointment update failed', error)
    return { error: 'Update failed. Try again.' }
  }

  revalidatePath('/admin/appointments')
  return { ok: true }
}

/**
 * Delete an appointment outright. Reserved for accidental
 * double-bookings / spam that slipped through OTP — the normal
 * flow is to set status='cancelled' so the historical record
 * survives. Confirmation lives on the client side.
 */
export async function deleteAppointment(
  _prev: UpdateAppointmentResult,
  formData: FormData,
): Promise<UpdateAppointmentResult> {
  await requirePlatformAdmin()

  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { error: 'Missing appointment id.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('demo_appointments')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[admin] appointment delete failed', error)
    return { error: 'Delete failed. Try again.' }
  }

  revalidatePath('/admin/appointments')
  return { ok: true }
}
