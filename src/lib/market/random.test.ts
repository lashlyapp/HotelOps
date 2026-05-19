import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pickN, pickOne, seededRandom } from './random'

describe('seededRandom', () => {
  it('produces the same stream for the same seed', () => {
    const a = seededRandom('property-123:2026-05-19')
    const b = seededRandom('property-123:2026-05-19')
    for (let i = 0; i < 50; i++) {
      assert.equal(a(), b())
    }
  })

  it('produces different streams for different seeds', () => {
    const a = seededRandom('property-A')
    const b = seededRandom('property-B')
    const first = [a(), a(), a()]
    const second = [b(), b(), b()]
    assert.notDeepEqual(first, second)
  })

  it('emits values in [0, 1)', () => {
    const rng = seededRandom('range-test')
    for (let i = 0; i < 100; i++) {
      const v = rng()
      assert.ok(v >= 0 && v < 1, `value ${v} out of range`)
    }
  })
})

describe('pickN', () => {
  it('returns all items when n >= length', () => {
    const out = pickN(['a', 'b', 'c'], 5, 'seed')
    assert.equal(out.length, 3)
    assert.deepEqual(out.sort(), ['a', 'b', 'c'])
  })

  it('returns the requested count without duplicates', () => {
    const out = pickN([1, 2, 3, 4, 5, 6, 7, 8], 4, 'seed-x')
    assert.equal(out.length, 4)
    assert.equal(new Set(out).size, 4)
  })

  it('is deterministic for the same seed', () => {
    const a = pickN([1, 2, 3, 4, 5, 6], 3, 'fixed')
    const b = pickN([1, 2, 3, 4, 5, 6], 3, 'fixed')
    assert.deepEqual(a, b)
  })
})

describe('pickOne', () => {
  it('returns an element from the list', () => {
    const items = ['x', 'y', 'z']
    const chosen = pickOne(items, 'seed')
    assert.ok(items.includes(chosen))
  })
})
