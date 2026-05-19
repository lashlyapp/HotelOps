import { NextResponse, type NextRequest } from 'next/server'
import { sendSourceHealthAlert } from '@/lib/email/source-health-alert'
import {
  classifySourceHealth,
  markAlerted,
  pickAlertableSources,
} from '@/lib/market/health'
import { verifyCronAuth } from '@/lib/market/sources/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Hourly cron. Classifies every registry source, picks the ones
// that need alerting (erroring or stale, not alerted in the last
// 24h), emails platform admins, stamps last_health_alert_at.

export async function GET(request: NextRequest) {
  const auth = verifyCronAuth(request)
  if (!auth.ok) return auth.response

  const states = await classifySourceHealth()
  const alertable = pickAlertableSources(states)
  if (alertable.length === 0) {
    return NextResponse.json({
      ok: true,
      total: states.length,
      alertable: 0,
      sent_to: 0,
    })
  }

  // Send to every platform_admin profile's email.
  const admin = createAdminClient()
  const { data: admins } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'platform_admin')
  const adminIds = ((admins as { id: string }[] | null) ?? []).map((a) => a.id)
  const recipients: string[] = []
  for (const id of adminIds) {
    const { data: u } = await admin.auth.admin.getUserById(id)
    const e = u?.user?.email
    if (e) recipients.push(e)
  }

  let sent = 0
  for (const recipient of recipients) {
    const ok = await sendSourceHealthAlert({ to: recipient, sources: alertable })
    if (ok) sent++
  }

  if (sent > 0) {
    await markAlerted(alertable.map((s) => s.source))
  }

  return NextResponse.json({
    ok: true,
    total: states.length,
    alertable: alertable.length,
    sent_to: sent,
    sources: alertable.map((s) => ({ source: s.source, reason: s.reason })),
  })
}
