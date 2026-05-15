import { NextResponse, type NextRequest } from 'next/server'
import { reconcileOrgSubscriptions } from '@/lib/stripe/reconcile'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Vercel Cron: nightly Stripe → DB reconciliation pass.
 *
 * Runs at 02:00 UTC daily (see vercel.json). This is the *third* line
 * of defense against billing_subscriptions drift, behind:
 *
 *   1. Stripe webhooks — fire within seconds of any customer.subscription.*
 *      change. Primary path.
 *   2. Login reconcile — fires post-response via `after()` in
 *      src/app/login/actions.ts. Catches drift before the user lands on
 *      /billing for the day's first session.
 *
 * The cron exists to cover the case where no one in the org logs in for
 * a while AND a webhook missed something AND a property was added in
 * the meantime — e.g. staff added a property for a traveling owner, the
 * org-level add-on flag should have been inherited, but a webhook
 * misfired so the SubscriptionItem never attached. The owner returns
 * three days later; the cron will have already healed it.
 *
 * Walks every org that has a Stripe customer attached and calls
 * reconcileOrgSubscriptions — which fast-paths to a no-op when every
 * property is fully synced AND every property's add-on state matches
 * the org flag. Only when drift is detected does it list Stripe subs.
 *
 * Drift sources covered: missed webhook deliveries, deploys that landed
 * mid-checkout, foreign-key races, metadata mismatches on subs created
 * outside the normal flow, org-flag-vs-SubscriptionItem disagreement.
 *
 * Schedule lives in `vercel.json`. Auth uses Vercel's
 * `Authorization: Bearer ${CRON_SECRET}` header. See docs/pricing.md
 * § "Background reconciliation" for the operational rationale and the
 * decision history behind the 24-hour cadence.
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
