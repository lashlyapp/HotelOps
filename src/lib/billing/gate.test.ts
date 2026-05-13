import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  BillingSubscription,
  BillingSubscriptionStatus,
} from '@/lib/supabase/types'
import {
  computeOrgGate,
  computePropertyGate,
  PAST_DUE_RESTRICT_DAYS,
} from './gate'

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

describe('computePropertyGate', () => {
  it('restricts a property with no subscription on file', () => {
    const gate = computePropertyGate(null)
    assert.equal(gate.banner, true)
    assert.equal(gate.restrictWrites, true)
    assert.equal(gate.restrictMedia, true)
    assert.equal(gate.status, 'no_subscription')
  })

  it('does not restrict active subscriptions', () => {
    const gate = computePropertyGate(makeSub({ status: 'active' }))
    assert.equal(gate.banner, false)
    assert.equal(gate.restrictWrites, false)
  })

  it('does not restrict an active subscription scheduled for cancellation', () => {
    // cancel_at_period_end=true should not lock the property; the
    // customer keeps access until current_period_end.
    const gate = computePropertyGate(
      makeSub({ status: 'active', cancel_at_period_end: true }),
    )
    assert.equal(gate.banner, false)
    assert.equal(gate.restrictWrites, false)
    assert.equal(gate.restrictMedia, false)
  })

  it('locks a property whose subscription has been canceled', () => {
    const gate = computePropertyGate(makeSub({ status: 'canceled' }))
    assert.equal(gate.banner, true)
    assert.equal(gate.restrictWrites, true)
    assert.equal(gate.restrictMedia, true)
  })

  it('banners but does not restrict past_due under threshold', () => {
    const gate = computePropertyGate(
      makeSub({ status: 'past_due', past_due_since: daysAgo(3) }),
    )
    assert.equal(gate.banner, true)
    assert.equal(gate.restrictWrites, false)
    assert.equal(gate.restrictMedia, false)
    assert.equal(gate.daysPastDue, 3)
  })

  it('restricts past_due >= 15 days', () => {
    const gate = computePropertyGate(
      makeSub({
        status: 'past_due',
        past_due_since: daysAgo(PAST_DUE_RESTRICT_DAYS + 1),
      }),
    )
    assert.equal(gate.restrictWrites, true)
    assert.equal(gate.restrictMedia, true)
  })

  it('locks paused subscriptions', () => {
    const gate = computePropertyGate(makeSub({ status: 'paused' }))
    assert.equal(gate.restrictWrites, true)
    assert.equal(gate.restrictMedia, true)
  })
})

describe('computeOrgGate', () => {
  it('shows onboarding banner with no restrictions when org has no properties', () => {
    const gate = computeOrgGate([], false)
    assert.equal(gate.banner, true)
    assert.equal(gate.restrictWrites, false)
    assert.equal(gate.restrictMedia, false)
    assert.equal(gate.status, 'no_subscription')
  })

  it('restricts the whole org when it has properties but no subscriptions at all', () => {
    const gate = computeOrgGate([], true)
    assert.equal(gate.banner, true)
    assert.equal(gate.restrictWrites, true)
    assert.equal(gate.restrictMedia, true)
  })

  it('does not restrict the org when at least one property has a subscription, even if another is canceled', () => {
    // Customer requirement: one property's billing failure must not lock
    // the rest of the org. Org-wide gate stays unrestricted; the canceled
    // property is locked by computePropertyGate instead.
    const gate = computeOrgGate([
      makeSub({ property_id: 'p1', status: 'active' }),
      makeSub({ property_id: 'p2', status: 'canceled' }),
    ])
    assert.equal(gate.restrictWrites, false)
    assert.equal(gate.restrictMedia, false)
    // But the org-shell banner does surface so the customer notices.
    assert.equal(gate.banner, true)
  })

  it('does not banner when all properties are active', () => {
    const gate = computeOrgGate([
      makeSub({ property_id: 'p1', status: 'active' }),
      makeSub({ property_id: 'p2', status: 'active' }),
    ])
    assert.equal(gate.banner, false)
    assert.equal(gate.restrictWrites, false)
  })

  it('surfaces a banner when any property is past_due, without restricting the org', () => {
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
})
