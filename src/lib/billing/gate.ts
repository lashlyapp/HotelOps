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
 * Map the stored subscription state to the gating decision used across the
 * app. Pure function — call sites pass in the row from billing_subscriptions
 * (or null) so we don't fan out a query per request.
 */
export function computeGate(
  subscription: BillingSubscription | null,
): BillingGate {
  if (!subscription) {
    // No subscription on file. Pricing is per-property, so the trigger
    // to start billing is the owner adding their first property — which
    // they kick off from /billing. Until then, writes + media access
    // are restricted so a free account can't accumulate billable
    // activity. The banner copy + the empty state on /properties both
    // point to /billing for the self-serve "Start subscription" flow.
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
        ? `Your account is ${daysPastDue} days past due. Editing and media access are locked until billing is restored.`
        : `Your last invoice is past due. Update your payment method in Billing to keep editing and media access (locks after ${PAST_DUE_RESTRICT_DAYS} days).`,
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
        'Your subscription has ended. Editing and media access are locked. Contact support to restore service.',
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
        'Your subscription is paused. Add a payment method in Billing to resume.',
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
 * Server-side helper for guards that don't already have the subscription row
 * in scope (server actions, /media). Reads through the service-role client
 * because RLS on billing_subscriptions is select-only for org members and
 * we sometimes want to check before the user's session has org context.
 */
export async function getGateForOrg(orgId: string): Promise<BillingGate> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()
  if (error) throw error
  return computeGate((data as BillingSubscription | null) ?? null)
}
