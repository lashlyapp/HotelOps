'use server'

import { redirect } from 'next/navigation'
import { VerifyCodeError, verifyLoginChallenge } from '@/lib/auth/mfa'
import { createClient } from '@/lib/supabase/server'

/**
 * Verify the MFA code at sign-in time. On success the session
 * escalates to aal2 and we route to /dashboard (or /admin for
 * platform admins). On failure we bounce back to /login/mfa with
 * an error string so the form can surface it.
 */
export async function verifyLoginMfa(formData: FormData) {
  const factorId = String(formData.get('factor_id') ?? '').trim()
  const code = String(formData.get('code') ?? '').trim()
  if (!factorId || !/^\d{6}$/.test(code)) {
    redirect('/login/mfa?error=invalid')
  }

  try {
    await verifyLoginChallenge(factorId, code)
  } catch (err) {
    if (err instanceof VerifyCodeError) {
      redirect('/login/mfa?error=wrong_code')
    }
    console.error('[login] MFA verify failed', err)
    redirect('/login/mfa?error=unknown')
  }

  // Re-fetch the user / profile to route correctly. The session is
  // already at aal2 by this point.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role === 'platform_admin') redirect('/admin')
  redirect('/dashboard')
}
