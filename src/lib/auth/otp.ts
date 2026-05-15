import 'server-only'
import { createHash, randomInt } from 'node:crypto'

export {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_RESENDS,
  OTP_TTL_MINUTES,
} from './otp-constants'
import { OTP_LENGTH } from './otp-constants'

/**
 * Cryptographically-random 6-digit code, always exactly OTP_LENGTH chars
 * (zero-padded). Uses crypto.randomInt — uniform across the 10^6 space,
 * unlike Math.random.
 */
export function generateOtp(): string {
  const max = 10 ** OTP_LENGTH
  return randomInt(0, max).toString().padStart(OTP_LENGTH, '0')
}

/** SHA-256 hash, hex-encoded. Used to compare a submitted code against
 *  the stored hash without ever putting the plaintext in the DB. */
export function hashOtp(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}
