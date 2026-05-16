import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { asLocale, DEFAULT_LOCALE, LOCALES } from './locales'

describe('asLocale', () => {
  it('returns the value when it is a supported locale', () => {
    for (const l of LOCALES) {
      assert.equal(asLocale(l), l)
    }
  })

  it('falls back to the default for unsupported / missing values', () => {
    assert.equal(asLocale('de'), DEFAULT_LOCALE)
    assert.equal(asLocale('en-US'), DEFAULT_LOCALE) // region tags not yet supported
    assert.equal(asLocale(null), DEFAULT_LOCALE)
    assert.equal(asLocale(undefined), DEFAULT_LOCALE)
    assert.equal(asLocale(''), DEFAULT_LOCALE)
  })

  it('does not throw on garbage input', () => {
    assert.equal(asLocale('<script>'), DEFAULT_LOCALE)
    assert.equal(asLocale('en;q=0.9'), DEFAULT_LOCALE)
  })
})
