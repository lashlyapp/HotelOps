import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type Stripe from 'stripe'
import {
  buildPropertyMemo,
  orgIdFromMetadata,
  propertyIdFromMetadata,
  subscriptionIdFromInvoice,
} from './webhook'

describe('orgIdFromMetadata', () => {
  it('returns null when metadata is null/undefined', () => {
    assert.equal(orgIdFromMetadata(null), null)
    assert.equal(orgIdFromMetadata(undefined), null)
  })

  it('returns null when org_id is missing', () => {
    assert.equal(orgIdFromMetadata({ app: 'hotelops' }), null)
  })

  it('returns org_id when app tag matches', () => {
    assert.equal(
      orgIdFromMetadata({ app: 'hotelops', org_id: 'org_abc' }),
      'org_abc',
    )
  })

  it('returns org_id when app tag is missing (lenient for older events)', () => {
    assert.equal(orgIdFromMetadata({ org_id: 'org_abc' }), 'org_abc')
  })

  it('returns null when app tag is set to something other than hotelops', () => {
    // Defense-in-depth: if a Lashly event ever lands here (wrong webhook
    // wiring), we drop it on the floor instead of touching our DB.
    assert.equal(
      orgIdFromMetadata({ app: 'lashly', org_id: 'org_abc' }),
      null,
    )
  })
})

describe('propertyIdFromMetadata', () => {
  it('returns null for missing metadata or property_id', () => {
    assert.equal(propertyIdFromMetadata(null), null)
    assert.equal(propertyIdFromMetadata(undefined), null)
    assert.equal(propertyIdFromMetadata({ app: 'hotelops' }), null)
  })

  it('returns property_id when app tag matches or is omitted', () => {
    assert.equal(
      propertyIdFromMetadata({ app: 'hotelops', property_id: 'prop_abc' }),
      'prop_abc',
    )
    assert.equal(
      propertyIdFromMetadata({ property_id: 'prop_abc' }),
      'prop_abc',
    )
  })

  it('returns null when app tag belongs to a different app', () => {
    assert.equal(
      propertyIdFromMetadata({ app: 'lashly', property_id: 'prop_abc' }),
      null,
    )
  })
})

describe('subscriptionIdFromInvoice', () => {
  it('returns the subscription id when parent is subscription_details (string ref)', () => {
    const inv = {
      parent: {
        type: 'subscription_details',
        subscription_details: { subscription: 'sub_abc' },
      },
    } as unknown as Stripe.Invoice
    assert.equal(subscriptionIdFromInvoice(inv), 'sub_abc')
  })

  it('returns the subscription id when parent is subscription_details (object ref)', () => {
    const inv = {
      parent: {
        type: 'subscription_details',
        subscription_details: { subscription: { id: 'sub_xyz' } },
      },
    } as unknown as Stripe.Invoice
    assert.equal(subscriptionIdFromInvoice(inv), 'sub_xyz')
  })

  it('returns null for invoices without subscription parent', () => {
    const inv = { parent: null } as unknown as Stripe.Invoice
    assert.equal(subscriptionIdFromInvoice(inv), null)
  })
})

describe('buildPropertyMemo', () => {
  it('renders the full address block when every field is populated', () => {
    const memo = buildPropertyMemo({
      name: 'Hotel ABC',
      address_line1: '123 Main St',
      address_line2: 'Suite 4',
      city: 'Sacramento',
      state: 'California',
      postal_code: '95816',
      country: 'US',
      email: 'front@hotel-abc.com',
    })
    assert.equal(
      memo,
      [
        'For property: Hotel ABC',
        '123 Main St',
        'Suite 4',
        'Sacramento, California 95816',
        'US',
        'front@hotel-abc.com',
      ].join('\n'),
    )
  })

  it('falls back to just the name when no address fields are set', () => {
    const memo = buildPropertyMemo({
      name: 'Hotel Bare',
      address_line1: null,
      address_line2: null,
      city: null,
      state: null,
      postal_code: null,
      country: null,
      email: null,
    })
    assert.equal(memo, 'For property: Hotel Bare')
  })

  it('omits empty city/state/postal pieces without leaving stray separators', () => {
    const memo = buildPropertyMemo({
      name: 'Hotel Partial',
      address_line1: '5 Loop Rd',
      address_line2: null,
      city: 'Reno',
      state: null,
      postal_code: '89501',
      country: 'US',
      email: null,
    })
    assert.equal(
      memo,
      ['For property: Hotel Partial', '5 Loop Rd', 'Reno 89501', 'US'].join('\n'),
    )
  })
})
