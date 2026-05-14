import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  PRIORITY_TONE,
  STATUSES,
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_TONE,
} from './labels'
import { formatAge } from './time'

describe('tasks labels', () => {
  it('every status enum value has a label, order entry, and tone', () => {
    for (const s of STATUSES) {
      assert.ok(STATUS_LABELS[s], `missing label for ${s}`)
      assert.ok(STATUS_TONE[s], `missing tone for ${s}`)
      assert.ok(STATUS_ORDER.includes(s), `missing order entry for ${s}`)
    }
    assert.equal(STATUS_ORDER.length, STATUSES.length)
  })

  it('every priority enum value has label, tone, and ordering rank', () => {
    for (const p of PRIORITIES) {
      assert.ok(PRIORITY_LABELS[p], `missing label for ${p}`)
      assert.ok(PRIORITY_TONE[p], `missing tone for ${p}`)
      assert.ok(
        Number.isFinite(PRIORITY_ORDER[p]),
        `missing priority order for ${p}`,
      )
    }
    // Urgent should sort before low — higher visibility on the board.
    assert.ok(PRIORITY_ORDER.urgent < PRIORITY_ORDER.low)
    assert.ok(PRIORITY_ORDER.high < PRIORITY_ORDER.normal)
  })

  it('every category enum value has a label and appears in the picker order', () => {
    for (const c of CATEGORIES) {
      assert.ok(CATEGORY_LABELS[c], `missing label for ${c}`)
      assert.ok(CATEGORY_ORDER.includes(c), `missing order entry for ${c}`)
    }
  })
})

describe('formatAge', () => {
  it('returns "just now" for very recent timestamps', () => {
    const now = new Date().toISOString()
    assert.equal(formatAge(now), 'just now')
  })

  it('returns minutes for the first hour', () => {
    const t = new Date(Date.now() - 5 * 60_000).toISOString()
    assert.equal(formatAge(t), '5m')
  })

  it('returns hours under a day', () => {
    const t = new Date(Date.now() - 3 * 60 * 60_000).toISOString()
    assert.equal(formatAge(t), '3h')
  })

  it('returns days under a week', () => {
    const t = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString()
    assert.equal(formatAge(t), '2d')
  })

  it('returns weeks then months for older dates', () => {
    const twoWeeks = new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString()
    assert.equal(formatAge(twoWeeks), '2w')
    const twoMonths = new Date(Date.now() - 60 * 24 * 60 * 60_000).toISOString()
    assert.equal(formatAge(twoMonths), '2mo')
  })

  it('safely handles bad input', () => {
    assert.equal(formatAge('not a date'), '')
  })
})
