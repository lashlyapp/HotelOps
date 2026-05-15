import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM helpers used to hold the signup-form password between
 * the OTP request and the OTP-verify step. The plaintext password is
 * never written to disk; the ciphertext lives in `signup_pending`
 * until verification, at which point the row is deleted.
 *
 * Key: 32-byte secret from `SIGNUP_ENCRYPTION_KEY`, base64- or
 * hex-encoded. Generate with `openssl rand -hex 32`. Rotating the
 * key invalidates any in-flight pending signups (they fail to
 * verify and have to re-submit) but that's a small blast radius —
 * the window is at most 15 minutes wide.
 *
 * Output format: base64(IV || ciphertext || authTag). The IV is the
 * standard 12 bytes; the tag is the standard 16 bytes. Bundling
 * everything into one string keeps the DB column count down.
 */

const IV_BYTES = 12
const TAG_BYTES = 16

function loadKey(): Buffer {
  const raw = process.env.SIGNUP_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'SIGNUP_ENCRYPTION_KEY is not set. Generate one with ' +
        '`openssl rand -hex 32` and set it as a server-only env var.',
    )
  }
  // Accept either hex (64 chars) or base64 (44 chars) for ergonomics.
  let key: Buffer
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex')
  } else {
    key = Buffer.from(raw, 'base64')
  }
  if (key.length !== 32) {
    throw new Error(
      `SIGNUP_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). ` +
        'Use `openssl rand -hex 32` to generate one.',
    )
  }
  return key
}

export function encryptString(plaintext: string): string {
  const key = loadKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ciphertext, tag]).toString('base64')
}

export function decryptString(encoded: string): string {
  const key = loadKey()
  const buf = Buffer.from(encoded, 'base64')
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('Ciphertext is too short to be valid.')
  }
  const iv = buf.subarray(0, IV_BYTES)
  const tag = buf.subarray(buf.length - TAG_BYTES)
  const ciphertext = buf.subarray(IV_BYTES, buf.length - TAG_BYTES)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}
