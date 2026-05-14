import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BillingSubscription } from '@/lib/supabase/types'
import { shouldLockOrg } from './cdn-gate'

function sub(partial: Partial<BillingSubscription>): BillingSubscription {
  return {
    property_id: 'prop_test',
    org_id: 'org_test',
    stripe_customer_id: 'cus_test',
    stripe_subscription_id: 'sub_test',
    stripe_price_id: 'price_test',
    status: 'active',
    payment_method_due_at: null,
    past_due_since: null,
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    unit_amount_cents: 10000,
    quantity: 1,
    currency: 'usd',
    default_payment_method_id: null,
    default_payment_brand: null,
    default_payment_last4: null,
    signage_unlimited_active: false,
    signage_unlimited_item_id: null,
    guest_experience_active: false,
    guest_experience_item_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  }
}

describe('shouldLockOrg', () => {
  it('does not lock onboarding orgs (no properties, no subs)', () => {
    assert.equal(shouldLockOrg([], false), false)
  })

  it('locks orgs that have properties but no subscription anywhere', () => {
    assert.equal(shouldLockOrg([], true), true)
  })

  it('does not lock orgs where at least one property has an active subscription', () => {
    // Under per-property gating, single-property issues do NOT lock at
    // the CDN edge — the in-app per-property gate handles them. The
    // org-level CDN lock only fires for "org has no subs anywhere."
    assert.equal(
      shouldLockOrg([
        sub({ property_id: 'p1', status: 'active' }),
        sub({ property_id: 'p2', status: 'canceled' }),
      ]),
      false,
    )
  })

  it('does not lock when subscriptions exist but no property has been added (edge case)', () => {
    assert.equal(shouldLockOrg([sub({ status: 'active' })], false), false)
  })
})
