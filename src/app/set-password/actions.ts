'use server'

import { redirect } from 'next/navigation'
import { validatePassword } from '@/lib/auth/password'
import { createClient } from '@/lib/supabase/server'

export async function setPassword(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  const check = validatePassword(password)
  if (!check.ok) {
    // Map the first-failing-rule message to a short error code we can
    // render. The page's ERROR_MESSAGES table mirrors the validator so
    // the user sees consistent copy whether the failure was caught
    // client-side, in this action, or server-side by Supabase.
    if (check.error.includes('characters')) {
      redirect('/set-password?error=too_short')
    }
    redirect('/set-password?error=weak')
  }
  if (password !== confirm) {
    redirect('/set-password?error=mismatch')
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Supabase's own password policy is the authoritative server-side floor.
  // If the dashboard policy is stricter than ours, this call still rejects.
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    redirect('/set-password?error=failed')
  }

  redirect('/media')
}
