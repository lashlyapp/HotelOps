'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Trigger a Supabase password-recovery email. We INTENTIONALLY do not tell
 * the caller whether the email exists in our system — surfacing that lets
 * an attacker enumerate registered accounts. The flow always lands on
 * /forgot-password/sent, and the email is only actually sent if the
 * address belongs to a real user.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) {
    redirect('/forgot-password?error=invalid')
  }

  const supabase = await createClient()
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '')

  // resetPasswordForEmail dispatches the recovery email through Supabase /
  // Resend. The redirectTo lands the user on /auth/callback, which
  // exchanges the recovery code for a session and forwards to /set-password
  // — the same flow used for first-time setup, so the password policy
  // gets enforced consistently.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback`,
  })

  redirect('/forgot-password/sent')
}
