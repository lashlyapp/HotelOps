import { NextResponse, type NextRequest } from 'next/server'
import { reconcileOrgSubscriptions } from '@/lib/stripe/reconcile'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Vercel Cron: hourly Stripe → DB reconciliation pass.
 *
 * Background defense for billing_subscriptions drift. Walks every org
 * that has a Stripe customer attached and calls reconcileOrgSubscriptions
 * — which fast-paths to a no-op if every property already has a synced
 * subscription row, and only hits Stripe when drift is detected.
 *
 * Drift sources covered: missed webhook deliveries, deploys that landed
 * mid-checkout, foreign-key races, metadata mismatches on subs created
 * outside the normal flow.
 *
 * Schedule lives in `vercel.json`. Auth uses Vercel's
 * `Authorization: Bearer ${CRON_SECRET}` header.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
  const { data: orgs, error } = await admin
    .from('organizations')
    .select('id, stripe_customer_id')
    .not('stripe_customer_id', 'is', null)
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    )
  }

  const failures: Array<{ orgId: string; message: string }> = []
  for (const org of orgs ?? []) {
    try {
      await reconcileOrgSubscriptions(org.id, org.stripe_customer_id)
    } catch (err) {
      // reconcileOrgSubscriptions catches its own errors, but belt and
      // suspenders so one bad org never aborts the whole pass.
      failures.push({
        orgId: org.id,
        message: err instanceof Error ? err.message : 'unknown',
      })
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: orgs?.length ?? 0,
    failures,
  })
}
