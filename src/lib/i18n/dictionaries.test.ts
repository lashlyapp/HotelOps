import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import en from './dictionaries/en.json'
import es from './dictionaries/es.json'
import fr from './dictionaries/fr.json'
import ja from './dictionaries/ja.json'
import ko from './dictionaries/ko.json'
import vi from './dictionaries/vi.json'

/**
 * Runtime parity check between EN (authoritative) and every other
 * locale dictionary. TypeScript's JSON-module typing is too narrow
 * to catch missing keys at compile time once `as Dictionary` casts
 * are involved, so this test holds the line: every key path in en
 * must exist in every other locale, with values of the same type.
 */
describe('dictionaries shape parity', () => {
  for (const [name, dict] of [
    ['es', es],
    ['fr', fr],
    ['ja', ja],
    ['ko', ko],
    ['vi', vi],
  ] as const) {
    it(`${name}.json mirrors en.json key-for-key`, () => {
      const missing = diffShape(en, dict, '')
      assert.deepEqual(
        missing,
        [],
        `Keys missing from ${name}.json (relative to en.json): ${missing.join(', ')}`,
      )
    })
  }
})

function diffShape(
  reference: unknown,
  candidate: unknown,
  path: string,
): string[] {
  if (typeof reference !== 'object' || reference === null) {
    return typeof candidate === typeof reference ? [] : [path || '<root>']
  }
  const out: string[] = []
  for (const key of Object.keys(reference as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      !(key in (candidate as Record<string, unknown>))
    ) {
      out.push(nextPath)
      continue
    }
    out.push(
      ...diffShape(
        (reference as Record<string, unknown>)[key],
        (candidate as Record<string, unknown>)[key],
        nextPath,
      ),
    )
  }
  return out
}
