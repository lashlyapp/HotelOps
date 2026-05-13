import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  BillingSubscription,
  BillingSubscriptionStatus,
} from '@/lib/supabase/types'
import { computeGate, computeOrgGate, PAST_DUE_RESTRICT_DAYS } from './gate'

function makeSub(
  partial: Partial<BillingSubscription> = {},
): BillingSubscription {
  return {
    property_id: 'prop_test',
    org_id: 'org_test',
    stripe_customer_id: 'cus_test',
    stripe_subscription_id: 'sub_test',
    stripe_price_id: 'price_test',
    status: 'active' as BillingSubscriptionStatus,
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
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

describe('computeGate', () => {
  it('restricts when no subscription is on file', () => {
    const gate = computeGate(null)
    assert.equal(gate.banner, true)
    assert.equal(gate.restrictWrites, true)
    assert.equal(gate.restrictMedia, true)
    assert.equal(gate.status, 'no_subscription')
  })

  it('returns no gate for active subscription', () => {
    const gate = computeGate(makeSub({ status: 'active' }))
    assert.equal(gate.banner, false)
    assert.equal(gate.restrictWrites, false)
  })

  it('returns no gate for trialing or incomplete (just-created) subs', () => {
    for (const status of ['trialing', 'incomplete'] as const) {
      const gate = computeGate(makeSub({ status }))
      assert.equal(gate.banner, false, `${status} should not banner`)
      assert.equal(gate.restrictWrites, false, `${status} should not restrict`)
    }
  })

  it('shows banner but does not restrict when past_due < 15 days', () => {
    const gate = computeGate(
      makeSub({ status: 'past_due', past_due_since: daysAgo(3) }),
    )
    assert.equal(gate.banner, true)
    assert.equal(gate.restrictWrites, false)
    assert.equal(gate.restrictMedia, false)
    assert.equal(gate.daysPastDue, 3)
  })

  it('restricts writes and media after 15 days past_due', () => {
    const gate = computeGate(
      makeSub({
        status: 'past_due',
        past_due_since: daysAgo(PAST_DUE_RESTRICT_DAYS + 1),
      }),
    )
    assert.equal(gate.banner, true)
    assert.equal(gate.restrictWrites, true)
    assert.equal(gate.restrictMedia, true)
  })

  it('restricts immediately when canceled', () => {
    const gate = computeGate(makeSub({ status: 'canceled' }))
    assert.equal(gate.banner, true)
    assert.equal(gate.restrictWrites, true)
    assert.equal(gate.restrictMedia, true)
  })

  it('restricts immediately when paused', () => {
    const gate = computeGate(makeSub({ status: 'paused' }))
    assert.equal(gate.restrictWrites, true)
    assert.equal(gate.restrictMedia, true)
  })

  it('handles past_due with no past_due_since stamped (defensive)', () => {
    const gate = computeGate(
      makeSub({ status: 'past_due', past_due_since: null }),
    )
    assert.equal(gate.banner, true)
    assert.equal(gate.restrictWrites, false)
    assert.equal(gate.daysPastDue, 0)
  })
})

describe('computeOrgGate', () => {
  it('restricts when the org has no subscriptions at all', () => {
    const gate = computeOrgGate([], false)
    assert.equal(gate.banner, true)
    assert.equal(gate.restrictWrites, true)
    assert.equal(gate.status, 'no_subscription')
  })

  it('does not restrict when every property is active', () => {
    const gate = computeOrgGate([
      makeSub({ property_id: 'p1', status: 'active' }),
      makeSub({ property_id: 'p2', status: 'active' }),
    ])
    assert.equal(gate.banner, false)
    assert.equal(gate.restrictWrites, false)
    assert.equal(gate.restrictMedia, false)
  })

  it('escalates to a banner when any property is past_due, even if others are active', () => {
    const gate = computeOrgGate([
      makeSub({ property_id: 'p1', status: 'active' }),
      makeSub({
        property_id: 'p2',
        status: 'past_due',
        past_due_since: daysAgo(3),
      }),
    ])
    assert.equal(gate.banner, true)
    assert.equal(gate.restrictWrites, false)
  })

  it('locks the whole org when any property crosses 15 days past_due', () => {
    const gate = computeOrgGate([
      makeSub({ property_id: 'p1', status: 'active' }),
      makeSub({
        property_id: 'p2',
        status: 'past_due',
        past_due_since: daysAgo(PAST_DUE_RESTRICT_DAYS + 1),
      }),
    ])
    assert.equal(gate.restrictWrites, true)
    assert.equal(gate.restrictMedia, true)
  })

  it('locks the whole org when any property is canceled', () => {
    const gate = computeOrgGate([
      makeSub({ property_id: 'p1', status: 'active' }),
      makeSub({ property_id: 'p2', status: 'canceled' }),
    ])
    assert.equal(gate.restrictWrites, true)
  })
})
