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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  }
}
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86400_000).toISOString()

describe('shouldLockOrg', () => {
  it('does not lock onboarding orgs (no properties, no subs)', () => {
    assert.equal(shouldLockOrg([], false), false)
  })

  it('locks orgs that have properties but no subscription on any of them', () => {
    assert.equal(shouldLockOrg([], true), true)
  })

  it('does not lock active / trialing / fresh-incomplete orgs', () => {
    assert.equal(shouldLockOrg([sub({ status: 'active' })]), false)
    assert.equal(shouldLockOrg([sub({ status: 'trialing' })]), false)
    assert.equal(shouldLockOrg([sub({ status: 'incomplete' })]), false)
  })

  it('does not lock orgs in the first 15 days of past_due on any property', () => {
    // Banner shows in-app but CDN keeps serving — leverage scales up over
    // time so an expired card has room to be fixed before the public site
    // breaks.
    assert.equal(
      shouldLockOrg([
        sub({ status: 'past_due', past_due_since: daysAgo(7) }),
      ]),
      false,
    )
  })

  it('locks the org when any property is 15+ days past_due', () => {
    assert.equal(
      shouldLockOrg([
        sub({ property_id: 'p1', status: 'active' }),
        sub({
          property_id: 'p2',
          status: 'past_due',
          past_due_since: daysAgo(16),
        }),
      ]),
      true,
    )
  })

  it('locks the org when any property is canceled / paused / incomplete_expired', () => {
    assert.equal(
      shouldLockOrg([
        sub({ property_id: 'p1', status: 'active' }),
        sub({ property_id: 'p2', status: 'canceled' }),
      ]),
      true,
    )
    assert.equal(shouldLockOrg([sub({ status: 'paused' })]), true)
    assert.equal(shouldLockOrg([sub({ status: 'incomplete_expired' })]), true)
  })
})
