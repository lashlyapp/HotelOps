'use server'

import { redirect } from 'next/navigation'
import { BRAND } from '@/lib/brand'
import { sendSignupNotification } from '@/lib/email/send'
import { createClient } from '@/lib/supabase/server'

export type SignupActionResult = { error?: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function submitSignupRequest(
  _prev: SignupActionResult,
  formData: FormData,
): Promise<SignupActionResult> {
  // Honeypot: bots fill every field, real users don't see this one
  // (it's hidden in the form). Silently 200 if it's set so the bot
  // thinks it succeeded and stops retrying.
  const honeypot = String(formData.get('website') ?? '')
  if (honeypot.trim()) {
    redirect('/signup/thanks')
  }

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const fullName = String(formData.get('full_name') ?? '').trim()
  const hotelName = String(formData.get('hotel_name') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim() || null
  const message = String(formData.get('message') ?? '').trim() || null

  if (!email || !fullName || !hotelName) {
    return { error: 'Email, your name, and hotel name are required.' }
  }
  if (!EMAIL_RE.test(email)) {
    return { error: 'Please enter a valid email address.' }
  }
  if (fullName.length > 200 || hotelName.length > 200) {
    return { error: 'That looks too long — keep names under 200 characters.' }
  }
  if (message && message.length > 2000) {
    return { error: 'Please keep your message under 2,000 characters.' }
  }

  // Anon client respects the RLS policy that allows public inserts only
  // when status='pending' (which is the default). No auth user is created.
  const supabase = await createClient()
  const { error } = await supabase.from('tenant_signup_requests').insert({
    email,
    full_name: fullName,
    hotel_name: hotelName,
    phone,
    message,
  })
  if (error) {
    console.error('[signup] insert failed', error)
    return {
      error:
        'Something went wrong saving your request. Please email ' +
        BRAND.supportEmail +
        ' and we’ll follow up directly.',
    }
  }

  // Best-effort notification to the platform admin. Failure here doesn't
  // block the prospect from getting their thank-you page.
  try {
    await sendSignupNotification({
      email,
      fullName,
      hotelName,
      phone,
      message,
    })
  } catch (err) {
    console.warn('[signup] admin notification failed', err)
  }

  redirect('/signup/thanks')
}
