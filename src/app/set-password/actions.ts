'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function setPassword(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (password.length < 8) {
    redirect('/set-password?error=too_short')
  }
  if (password !== confirm) {
    redirect('/set-password?error=mismatch')
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    redirect('/set-password?error=failed')
  }

  redirect('/media')
}
