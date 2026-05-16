import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  BillingSubscription,
  BillingSubscriptionStatus,
} from '@/lib/supabase/types'
import { computeTrialState, trialBannerMessage } from './trial'

/**
 * Number of days a property's subscription can sit in past_due before
 * access to that property is restricted. Until then, only a banner is
 * shown on the Billing page.
 */
export const PAST_DUE_RESTRICT_DAYS = 15

export type BillingGate = {
  /** Whether to render the warning banner across the app shell (org-wide
   *  gate) or for the property in question (property-wide gate). */
  banner: boolean
  /** True → mutating server actions targeting this scope should reject. */
  restrictWrites: boolean
  /** True → media for this scope is locked. */
  restrictMedia: boolean
  /** Short human-readable banner copy. */
  message: string | null
  /** Lifecycle status (passed through for the UI). */
  status: BillingSubscriptionStatus | 'no_subscription'
  /** Days the subscription has been past_due. Null when not past_due. */
  daysPastDue: number | null
}

const OK_STATUSES: BillingSubscriptionStatus[] = [
  'active',
  'trialing',
  'incomplete', // brand-new subscription, before first invoice settles
]

/**
 * Map a single subscription row to the gating decision for that one
 * property. Pure function — call sites pass the row (or null) so we
 * don't fan out a query per request.
 *
 * Per-property semantics:
 *  - canceled / incomplete_expired / paused → locked. The customer can
 *    resubscribe from Billing; the property's data is preserved.
 *  - past_due / unpaid:
 *      < {@link PAST_DUE_RESTRICT_DAYS} days → banner only, still usable.
 *      ≥ {@link PAST_DUE_RESTRICT_DAYS} days → locked.
 *  - No subscription on file → locked. The property exists but billing
 *    was never started for it; admin/owner needs to subscribe from
 *    Billing before the property can be used.
 *  - active / trialing / incomplete → unrestricted, no banner.
 *
 * cancel_at_period_end is intentionally NOT a restriction trigger: a
 * customer who scheduled cancellation keeps full access until the
 * period actually ends (Stripe fires customer.subscription.deleted at
 * that point and status flips to `canceled`, which IS a restriction).
 */
export function computePropertyGate(
  subscription: BillingSubscription | null,
  trialEndsAt: string | null = null,
): BillingGate {
  if (!subscription) {
    // Self-serve trial path: org has no Stripe subscription but its
    // trial window is open → unrestricted, with a countdown banner.
    // After the window closes the gate flips to read-only.
    const trial = computeTrialState(trialEndsAt)
    if (trial.kind === 'active') {
      return {
        banner: true,
        restrictWrites: false,
        restrictMedia: false,
        message: trialBannerMessage(trial),
        status: 'trialing',
        daysPastDue: null,
      }
    }
    if (trial.kind === 'expired') {
      return {
        banner: true,
        restrictWrites: true,
        restrictMedia: true,
        message: trialBannerMessage(trial),
        status: 'no_subscription',
        daysPastDue: null,
      }
    }
    return {
      banner: true,
      restrictWrites: true,
      restrictMedia: true,
      message:
        'This property has no subscription yet. Start one from Billing to enable it.',
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
        ? `This property is ${daysPastDue} days past due. Editing and media are locked until billing is restored.`
        : `This property's last invoice is past due. Update its card in Billing to keep editing access (locks after ${PAST_DUE_RESTRICT_DAYS} days).`,
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
        'This property’s subscription has ended. Resubscribe from Billing to restore access — your data is preserved.',
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
        'This property’s subscription is paused. Add a payment method in Billing to resume.',
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
 * Backwards-compatible alias used by older call sites. Same semantics as
 * {@link computePropertyGate}.
 */
export const computeGate = computePropertyGate

/**
 * Org-wide gating decision. Intentionally narrow now that we enforce
 * per-property: the only org-wide restriction is "the org has properties
 * but has never started billing on any of them" — that's the initial-
 * onboarding nudge across the app shell. Once any property has a
 * subscription, every other gating decision is per-property.
 *
 * Past-due / canceled state on one property does NOT lock the rest of
 * the org. That's by design — the customer requirement is each property
 * runs on its own books, so one property's billing failure shouldn't
 * make their other properties unusable.
 */
export function computeOrgGate(
  subscriptions: BillingSubscription[],
  hasProperties = true,
  trialEndsAt: string | null = null,
): BillingGate {
  if (!hasProperties) {
    // Brand-new org, no properties yet. Onboarding nudge but no
    // restriction — adding a property is the gateway action and the
    // /properties page must not be gated to allow that.
    return {
      banner: true,
      restrictWrites: false,
      restrictMedia: false,
      message:
        'You haven’t added a property yet. Add one to get started.',
      status: 'no_subscription',
      daysPastDue: null,
    }
  }

  const anySubscription = subscriptions.some(
    (s) => s.stripe_subscription_id != null,
  )
  if (!anySubscription) {
    // Self-serve trial: org has properties but no paid sub yet. If the
    // trial window is open the org operates normally with a countdown
    // banner; once it closes we lock writes and prompt for a card.
    const trial = computeTrialState(trialEndsAt)
    if (trial.kind === 'active') {
      return {
        banner: true,
        restrictWrites: false,
        restrictMedia: false,
        message: trialBannerMessage(trial),
        status: 'trialing',
        daysPastDue: null,
      }
    }
    if (trial.kind === 'expired') {
      return {
        banner: true,
        restrictWrites: true,
        restrictMedia: true,
        message: trialBannerMessage(trial),
        status: 'no_subscription',
        daysPastDue: null,
      }
    }
    return {
      banner: true,
      restrictWrites: true,
      restrictMedia: true,
      message:
        'You have properties but no active subscription. Go to Billing to start one.',
      status: 'no_subscription',
      daysPastDue: null,
    }
  }

  // At least one subscription is on file → org is operating. Surface a
  // soft banner if ANY property has a non-OK gate, so the customer
  // notices issues at the app shell, but don't restrict — per-property
  // enforcement handles that.
  const propertyGates = subscriptions.map((s) => computePropertyGate(s))
  const anyAttention = propertyGates.some((g) => g.banner)
  if (anyAttention) {
    const restricted = propertyGates.filter(
      (g) => g.restrictWrites || g.restrictMedia,
    ).length
    return {
      banner: true,
      restrictWrites: false,
      restrictMedia: false,
      message:
        restricted > 0
          ? `${restricted} propert${restricted === 1 ? 'y is' : 'ies are'} locked due to billing issues. See Billing to resolve.`
          : 'One or more properties have billing attention items. See Billing.',
      status: 'active',
      daysPastDue: null,
    }
  }

  return {
    banner: false,
    restrictWrites: false,
    restrictMedia: false,
    message: null,
    status: 'active',
    daysPastDue: null,
  }
}

/**
 * Per-property gate fetched directly from the DB. For server actions
 * that target a single property and need to gate-check it (e.g.
 * updateProperty, mediaUpload). Reads through the service-role client
 * because RLS on billing_subscriptions is select-only for org members.
 */
export async function getGateForProperty(
  propertyId: string,
): Promise<BillingGate> {
  const admin = createAdminClient()
  const { data: sub, error } = await admin
    .from('billing_subscriptions')
    .select('*')
    .eq('property_id', propertyId)
    .maybeSingle()
  if (error) throw error
  // Trial state only matters when there's no subscription yet, but the
  // org row is small and the join is one round-trip either way.
  let trialEndsAt: string | null = null
  if (!sub) {
    const { data: property } = await admin
      .from('properties')
      .select('org_id')
      .eq('id', propertyId)
      .maybeSingle()
    if (property?.org_id) {
      const { data: org } = await admin
        .from('organizations')
        .select('trial_ends_at')
        .eq('id', property.org_id)
        .maybeSingle()
      trialEndsAt = org?.trial_ends_at ?? null
    }
  }
  return computePropertyGate(
    (sub as BillingSubscription | null) ?? null,
    trialEndsAt,
  )
}

/**
 * Org-wide gate fetched from the DB. Kept for app-shell banner logic
 * and the onboarding-state check. Property-mutating callers should use
 * {@link getGateForProperty} instead so a billing issue on property A
 * doesn't block edits to property B.
 */
export async function getGateForOrg(orgId: string): Promise<BillingGate> {
  const admin = createAdminClient()
  const [subsRes, propsRes, orgRes] = await Promise.all([
    admin.from('billing_subscriptions').select('*').eq('org_id', orgId),
    admin
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    admin
      .from('organizations')
      .select('trial_ends_at')
      .eq('id', orgId)
      .maybeSingle(),
  ])
  if (subsRes.error) throw subsRes.error
  if (propsRes.error) throw propsRes.error
  const subs = (subsRes.data as BillingSubscription[] | null) ?? []
  const hasProperties = (propsRes.count ?? 0) > 0
  return computeOrgGate(subs, hasProperties, orgRes.data?.trial_ends_at ?? null)
}
