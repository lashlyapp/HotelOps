import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { interpolate } from './interpolate'

describe('interpolate', () => {
  it('substitutes simple placeholders', () => {
    assert.equal(interpolate('Hi {name}', { name: 'Ada' }), 'Hi Ada')
  })

  it('coerces numbers to strings', () => {
    assert.equal(interpolate('{n} attempts', { n: 3 }), '3 attempts')
  })

  it('handles multiple substitutions including repeats', () => {
    assert.equal(
      interpolate('{a}+{b}+{a}', { a: 'x', b: 'y' }),
      'x+y+x',
    )
  })

  it('leaves unknown placeholders intact for visibility', () => {
    // Visible "{missing}" tokens in the output let a translator
    // notice missing copy at QA time instead of a silent empty.
    assert.equal(interpolate('Hi {name}', {}), 'Hi {name}')
    assert.equal(
      interpolate('{known} and {unknown}', { known: 'ok' }),
      'ok and {unknown}',
    )
  })

  it('returns the template unchanged when there are no placeholders', () => {
    assert.equal(interpolate('static string', { x: 1 }), 'static string')
  })

  it('ignores non-word characters inside braces', () => {
    assert.equal(interpolate('{ space }', { ' space ': 'x' }), '{ space }')
  })
})
