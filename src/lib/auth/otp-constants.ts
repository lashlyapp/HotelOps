/**
 * OTP constants split out from {@link ./otp} so they can be imported
 * from client components — `otp.ts` itself pulls in `node:crypto`,
 * which isn't available in the browser bundle.
 */

export const OTP_LENGTH = 6
export const OTP_TTL_MINUTES = 15
export const OTP_MAX_ATTEMPTS = 6
export const OTP_MAX_RESENDS = 4
