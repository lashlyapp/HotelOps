import { NextResponse, type NextRequest } from 'next/server'
import { verifySignupEmail } from '../actions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Verification-link handler. The user clicks the link in the email we
 * send them after submitting /signup; this confirms the address, marks
 * the row visible to /admin, and dispatches the admin notification.
 *
 * Tokens are one-shot (cleared on first successful verification) and
 * expire after 24 hours.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const ok = await verifySignupEmail(token)
  const base = req.nextUrl.origin
  if (ok) {
    return NextResponse.redirect(`${base}/signup/verified`)
  }
  return NextResponse.redirect(`${base}/signup/verify-invalid`)
}
