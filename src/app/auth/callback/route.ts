import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Handles the redirect after a Supabase magic link / invite click.
 *
 * Supabase issues a one-time `code` query param; we exchange it for a session
 * cookie, then send the user to `next` (default: /set-password for invites,
 * /media for ordinary sign-ins).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/set-password'
  const errorDesc = url.searchParams.get('error_description')

  if (errorDesc) {
    return NextResponse.redirect(
      new URL(`/login?error=invalid&detail=${encodeURIComponent(errorDesc)}`, url),
    )
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=invalid', url))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(new URL('/login?error=invalid', url))
  }

  return NextResponse.redirect(new URL(next, url))
}
