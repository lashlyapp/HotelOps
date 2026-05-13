import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  BillingSubscription,
  BillingSubscriptionStatus,
} from '@/lib/supabase/types'

/**
 * Number of days a subscription can sit in past_due before app access is
 * restricted. Until then, only a banner is shown.
 */
export const PAST_DUE_RESTRICT_DAYS = 15

export type BillingGate = {
  /** Whether to render the warning banner across the app shell. */
  banner: boolean
  /** True → mutating server actions should reject. */
  restrictWrites: boolean
  /** True → /media is locked behind a "service restricted" page. */
  restrictMedia: boolean
  /** Short human-readable banner copy. */
  message: string | null
  /** Lifecycle status (passed through for the UI). */
  status: BillingSubscriptionStatus | 'no_subscription'
  /** Days the org has been past_due. Null when not past_due. */
  daysPastDue: number | null
}

const OK_STATUSES: BillingSubscriptionStatus[] = [
  'active',
  'trialing',
  'incomplete', // brand-new subscription, before first invoice settles
]

/**
 * Map a single subscription row to its gating decision. Pure function — call
 * sites pass in the row (or null) so we don't fan out a query per request.
 *
 * Org-wide gating is computed by aggregating these per-property decisions
 * via {@link computeOrgGate}.
 */
export function computeGate(
  subscription: BillingSubscription | null,
): BillingGate {
  if (!subscription) {
    return {
      banner: true,
      restrictWrites: true,
      restrictMedia: true,
      message:
        'You haven’t started a subscription yet. Go to Billing to add a payment method and your first property.',
      status: 'no_subscription',
      daysPastDue: null,
    }
  }

  if (OK_STATUSES.includes(subscription.status)) {
    return {
      banner: false,
      restrictWrites: false,
      restrictMedia: false,
      message: null,
      status: subscription.status,
      daysPastDue: null,
    }
  }

  if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
    const daysPastDue = subscription.past_due_since
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(subscription.past_due_since).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : 0
    const restricted = daysPastDue >= PAST_DUE_RESTRICT_DAYS
    return {
      banner: true,
      restrictWrites: restricted,
      restrictMedia: restricted,
      message: restricted
        ? `One or more properties are ${daysPastDue} days past due. Editing and media access are locked until billing is restored.`
        : `A property’s last invoice is past due. Update its payment method in Billing to keep editing and media access (locks after ${PAST_DUE_RESTRICT_DAYS} days).`,
      status: subscription.status,
      daysPastDue,
    }
  }

  if (
    subscription.status === 'canceled' ||
    subscription.status === 'incomplete_expired'
  ) {
    return {
      banner: true,
      restrictWrites: true,
      restrictMedia: true,
      message:
        'A property’s subscription has ended. Editing and media access are locked. Contact support to restore service.',
      status: subscription.status,
      daysPastDue: null,
    }
  }

  if (subscription.status === 'paused') {
    return {
      banner: true,
      restrictWrites: true,
      restrictMedia: true,
      message:
        'A property’s subscription is paused. Add a payment method in Billing to resume.',
      status: subscription.status,
      daysPastDue: null,
    }
  }

  return {
    banner: false,
    restrictWrites: false,
    restrictMedia: false,
    message: null,
    status: subscription.status,
    daysPastDue: null,
  }
}

/**
 * Org-wide gating decision: pick the worst case across all of the org's
 * property subscriptions. Rule of thumb: if any property would lock the
 * user out, lock the whole org. That mirrors how the customer's books are
 * separated but operational personnel are shared, so a single past_due
 * property restricts the whole shared app surface.
 *
 * `hasProperties` lets us distinguish "no subscriptions because no
 * properties yet" from "properties exist but billing was never started" —
 * both are restricted, but they use different onboarding copy.
 */
export function computeOrgGate(
  subscriptions: BillingSubscription[],
  hasProperties = true,
): BillingGate {
  if (subscriptions.length === 0) {
    return {
      banner: true,
      restrictWrites: true,
      restrictMedia: true,
      message: hasProperties
        ? 'You have properties but no active subscription. Go to Billing to add a payment method.'
        : 'You haven’t started a subscription yet. Go to Billing to add a payment method and your first property.',
      status: 'no_subscription',
      daysPastDue: null,
    }
  }
  return subscriptions
    .map((s) => computeGate(s))
    .reduce<BillingGate>((worst, g) => mergeGates(worst, g), {
      banner: false,
      restrictWrites: false,
      restrictMedia: false,
      message: null,
      status: 'active',
      daysPastDue: null,
    })
}

function severity(g: BillingGate): number {
  if (g.restrictMedia || g.restrictWrites) return 3
  if (g.banner) return 2
  return 1
}

function mergeGates(a: BillingGate, b: BillingGate): BillingGate {
  const restrictWrites = a.restrictWrites || b.restrictWrites
  const restrictMedia = a.restrictMedia || b.restrictMedia
  const banner = a.banner || b.banner
  const pick = severity(b) > severity(a) ? b : a
  const daysPastDue =
    a.daysPastDue != null && b.daysPastDue != null
      ? Math.max(a.daysPastDue, b.daysPastDue)
      : (a.daysPastDue ?? b.daysPastDue)
  return {
    banner,
    restrictWrites,
    restrictMedia,
    message: pick.message,
    status: pick.status,
    daysPastDue,
  }
}

/**
 * Server-side helper for guards that don't already have the subscription
 * rows in scope (server actions, /media). Reads through the service-role
 * client because RLS on billing_subscriptions is select-only for org
 * members and we sometimes want to check before the user's session has
 * org context.
 */
export async function getGateForOrg(orgId: string): Promise<BillingGate> {
  const admin = createAdminClient()
  const [subsRes, propsRes] = await Promise.all([
    admin.from('billing_subscriptions').select('*').eq('org_id', orgId),
    admin
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
  ])
  if (subsRes.error) throw subsRes.error
  if (propsRes.error) throw propsRes.error
  const subs = (subsRes.data as BillingSubscription[] | null) ?? []
  const hasProperties = (propsRes.count ?? 0) > 0
  return computeOrgGate(subs, hasProperties)
}
