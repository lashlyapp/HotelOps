import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'

// Shared auth for /api/cron/scrape-* endpoints.
// Mirrors the convention in /api/cron/trial-expiry: Vercel cron sends
// `Authorization: Bearer ${CRON_SECRET}`. Also accepts requests from a
// platform_admin via the existing session for "Run now" admin actions
// (delegated check happens in the route handler since we want this
// helper edge-light).

export type CronAuthResult =
  | { ok: true }
  | { ok: false; response: NextResponse }

export function verifyCronAuth(request: NextRequest): CronAuthResult {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: 'CRON_SECRET not set' },
        { status: 500 },
      ),
    }
  }
  const auth = request.headers.get('authorization')
  if (auth === `Bearer ${expected}`) return { ok: true }
  return {
    ok: false,
    response: NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 },
    ),
  }
}
