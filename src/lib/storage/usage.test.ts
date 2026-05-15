import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { STORAGE_BLOCK_BYTES, computeStorageBlocks, formatBytes } from './usage'
import { checkStorageGuardrails } from './guardrails'

const GB = 1024 ** 3

describe('computeStorageBlocks', () => {
  it('returns 0 when within quota', () => {
    assert.equal(
      computeStorageBlocks({ usedBytes: 0, quotaBytes: 25 * GB }),
      0,
    )
    assert.equal(
      computeStorageBlocks({ usedBytes: 25 * GB, quotaBytes: 25 * GB }),
      0,
    )
  })

  it('charges one block as soon as usage crosses the soft cap', () => {
    assert.equal(
      computeStorageBlocks({ usedBytes: 25 * GB + 1, quotaBytes: 25 * GB }),
      1,
    )
  })

  it('rounds up partial blocks', () => {
    // 25 GB base + 30 GB over = needs 2 blocks (one block holds 25 GB)
    assert.equal(
      computeStorageBlocks({
        usedBytes: 25 * GB + 30 * GB,
        quotaBytes: 25 * GB,
      }),
      2,
    )
  })

  it('handles a custom quota (e.g. an enterprise property)', () => {
    // 100 GB quota, 110 GB used → 10 GB over → 1 block (25 GB rounds up)
    assert.equal(
      computeStorageBlocks({
        usedBytes: 110 * GB,
        quotaBytes: 100 * GB,
      }),
      1,
    )
  })
})

describe('checkStorageGuardrails', () => {
  const property = (used: number, quota = 25 * GB) => ({
    storage_used_bytes: used,
    storage_quota_bytes: quota,
  })

  it('accepts uploads well within the quota silently', () => {
    const r = checkStorageGuardrails(property(5 * GB), 100 * 1024 * 1024)
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.warning, undefined)
  })

  it('warns when an upload crosses into the first paid block', () => {
    const r = checkStorageGuardrails(property(24.5 * GB), 1 * GB)
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.ok(r.warning)
      assert.equal(r.warning?.kind, 'storage_block_added')
    }
  })

  it('warns again when an upload crosses into another paid block', () => {
    // Already in block 1 (50 GB used). New 30 GB upload pushes to 80 GB,
    // which is block 3 (50–75 GB is block 2, 75–100 is block 3).
    const r = checkStorageGuardrails(property(50 * GB), 30 * GB)
    assert.equal(r.ok, true)
    if (r.ok) assert.ok(r.warning)
  })

  it('does NOT warn when staying within the current paid block', () => {
    // 26 GB used = in block 1. A small upload still in block 1 should
    // be silent (no warning toast).
    const r = checkStorageGuardrails(property(26 * GB), 1 * 1024 * 1024)
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.warning, undefined)
  })

  it('refuses uploads that would exceed the hard cap', () => {
    const r = checkStorageGuardrails(property(495 * GB), 10 * GB)
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /500 GB/)
  })
})

describe('formatBytes', () => {
  it('uses bytes / KB / MB / GB threshold formatting', () => {
    assert.equal(formatBytes(500), '500 B')
    assert.equal(formatBytes(1024 * 250), '250.0 KB')
    assert.equal(formatBytes(1024 ** 2 * 5), '5.0 MB')
    assert.equal(formatBytes(1024 ** 3 * 12.3), '12.3 GB')
  })
})

describe('STORAGE_BLOCK_BYTES', () => {
  it('is 25 GB', () => {
    assert.equal(STORAGE_BLOCK_BYTES, 25 * GB)
  })
})
