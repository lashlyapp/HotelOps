import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { decryptString, encryptString } from './aes'

describe('aes string encryption', () => {
  let originalKey: string | undefined

  beforeEach(() => {
    originalKey = process.env.SIGNUP_ENCRYPTION_KEY
    process.env.SIGNUP_ENCRYPTION_KEY = randomBytes(32).toString('hex')
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.SIGNUP_ENCRYPTION_KEY
    else process.env.SIGNUP_ENCRYPTION_KEY = originalKey
  })

  it('round-trips a typical password', () => {
    const password = 'CorrectHorseBatteryStaple!1'
    const cipher = encryptString(password)
    assert.notEqual(cipher, password)
    assert.equal(decryptString(cipher), password)
  })

  it('produces a different ciphertext each time (random IV)', () => {
    const password = 'same-input'
    const a = encryptString(password)
    const b = encryptString(password)
    assert.notEqual(a, b)
    assert.equal(decryptString(a), password)
    assert.equal(decryptString(b), password)
  })

  it('rejects ciphertext tampered with under the wrong tag', () => {
    const cipher = encryptString('secret')
    const buf = Buffer.from(cipher, 'base64')
    // Flip a bit in the middle of the ciphertext body.
    buf[buf.length - 20] ^= 0x01
    const tampered = buf.toString('base64')
    assert.throws(() => decryptString(tampered))
  })

  it('throws clearly when the env var is missing', () => {
    delete process.env.SIGNUP_ENCRYPTION_KEY
    assert.throws(
      () => encryptString('x'),
      /SIGNUP_ENCRYPTION_KEY/,
    )
  })
})
