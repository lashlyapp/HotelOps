import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { orgIdFromMetadata } from './webhook'

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
