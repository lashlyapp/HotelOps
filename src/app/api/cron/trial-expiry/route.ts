import { NextResponse, type NextRequest } from 'next/server'
import {
  sendTrialExpiredEmail,
  sendTrialReminderEmail,
} from '@/lib/email/send'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Vercel Cron: trial-lifecycle emails and pending-signup GC.
 *
 * Runs hourly (see vercel.json). On every run:
 *
 *   1. Send T-3-day reminder to trial orgs whose trial_ends_at lands
 *      in (now+2d, now+3d] AND haven't been reminded yet AND haven't
 *      converted to paid.
 *   2. Send T+0 "trial ended" email to orgs whose trial_ends_at is
 *      in the past AND haven't been emailed about it yet AND haven't
 *      converted.
 *   3. Delete signup_pending rows that have expired so the table
 *      doesn't accumulate stale OTPs / encrypted password blobs.
 *
 * Idempotency: the {*}_sent_at columns are stamped before the email
 * is dispatched so a retry can't double-send. The cron is safe to
 * run on any cadence; the queries are bounded by indexed predicates.
 *
 * Auth: same `Authorization: Bearer ${CRON_SECRET}` convention used
 * by /api/cron/billing-reconcile.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type OrgRow = {
  id: string
  name: string
  trial_ends_at: string | null
  trial_reminder_t3_sent_at: string | null
  trial_expired_email_sent_at: string | null
  trial_converted_at: string | null
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not set' },
      { status: 500 },
    )
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 },
    )
  }

  const admin = createAdminClient()
  const now = new Date()
  const t3Lower = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString()
  const t3Upper = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()

  // T-3 reminder candidates.
  const { data: t3Orgs, error: t3Err } = await admin
    .from('organizations')
    .select(
      'id, name, trial_ends_at, trial_reminder_t3_sent_at, trial_expired_email_sent_at, trial_converted_at',
    )
    .is('trial_reminder_t3_sent_at', null)
    .is('trial_converted_at', null)
    .gt('trial_ends_at', t3Lower)
    .lte('trial_ends_at', t3Upper)
  if (t3Err) {
    return NextResponse.json(
      { ok: false, error: `t3 lookup: ${t3Err.message}` },
      { status: 500 },
    )
  }

  // Expired candidates.
  const { data: expiredOrgs, error: expErr } = await admin
    .from('organizations')
    .select(
      'id, name, trial_ends_at, trial_reminder_t3_sent_at, trial_expired_email_sent_at, trial_converted_at',
    )
    .is('trial_expired_email_sent_at', null)
    .is('trial_converted_at', null)
    .lt('trial_ends_at', now.toISOString())
  if (expErr) {
    return NextResponse.json(
      { ok: false, error: `expired lookup: ${expErr.message}` },
      { status: 500 },
    )
  }

  let t3Sent = 0
  for (const org of (t3Orgs ?? []) as OrgRow[]) {
    if (!org.trial_ends_at) continue
    const recipient = await getOrgOwner(admin, org.id)
    if (!recipient) continue
    const daysLeft = Math.max(
      1,
      Math.ceil(
        (new Date(org.trial_ends_at).getTime() - now.getTime()) /
          (24 * 60 * 60 * 1000),
      ),
    )
    // Stamp first so a retry won't double-send if the email call hangs.
    await admin
      .from('organizations')
      .update({ trial_reminder_t3_sent_at: now.toISOString() })
      .eq('id', org.id)
    await sendTrialReminderEmail({
      to: recipient.email,
      recipientName: recipient.fullName ?? 'there',
      hotelName: org.name,
      daysLeft,
    }).catch((err) => {
      console.warn('[cron] trial-expiry T-3 email failed', org.id, err)
    })
    t3Sent += 1
  }

  let expiredSent = 0
  for (const org of (expiredOrgs ?? []) as OrgRow[]) {
    const recipient = await getOrgOwner(admin, org.id)
    if (!recipient) continue
    await admin
      .from('organizations')
      .update({ trial_expired_email_sent_at: now.toISOString() })
      .eq('id', org.id)
    await sendTrialExpiredEmail({
      to: recipient.email,
      recipientName: recipient.fullName ?? 'there',
      hotelName: org.name,
    }).catch((err) => {
      console.warn('[cron] trial-expiry T+0 email failed', org.id, err)
    })
    expiredSent += 1
  }

  // GC pending signups. Expired rows hold encrypted passwords; we'd
  // rather not keep them around longer than necessary.
  const { count: deleted } = await admin
    .from('signup_pending')
    .delete({ count: 'exact' })
    .lt('expires_at', now.toISOString())

  return NextResponse.json({
    ok: true,
    t3Sent,
    expiredSent,
    pendingDeleted: deleted ?? 0,
  })
}

type AdminClient = ReturnType<typeof createAdminClient>

async function getOrgOwner(
  admin: AdminClient,
  orgId: string,
): Promise<{ email: string; fullName: string | null } | null> {
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('org_id', orgId)
    .eq('role', 'org_owner')
    .limit(1)
  const profile = profiles?.[0]
  if (!profile) return null
  const { data } = await admin.auth.admin.getUserById(profile.id)
  const email = data.user?.email
  if (!email) return null
  return { email, fullName: profile.full_name ?? null }
}
