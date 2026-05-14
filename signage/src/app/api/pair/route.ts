import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PairBody = { code?: unknown }

/**
 * POST { code } — pair a TV with a 6-digit code the operator generated.
 *
 * Returns the player_token on success; the client then navigates to
 * `/${token}`. Codes expire after 10 minutes and are cleared once bound
 * (single-use). We don't expose a "guess the code" oracle: the response
 * is always 200 with `{ ok: false, error }` so a brute-force probe
 * doesn't get speed-of-light feedback from the network stack — and the
 * code space is 1M which we'd want a rate limit in front of for
 * production. Per-IP throttle deferred to v1.1.
 */
export async function POST(req: NextRequest) {
  let body: PairBody
  try {
    body = (await req.json()) as PairBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request.' })
  }
  const raw = typeof body.code === 'string' ? body.code : ''
  const cleaned = raw.trim().replace(/\s+/g, '')
  if (!/^\d{6}$/.test(cleaned)) {
    return NextResponse.json({
      ok: false,
      error: 'Enter the 6-digit code from your operator.',
    })
  }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('signage_screens')
    .select('*')
    .eq('pairing_code', cleaned)
    .maybeSingle()
  if (!row) {
    return NextResponse.json({ ok: false, error: 'That code is not valid.' })
  }
  if (
    !row.pairing_code_expires_at ||
    new Date(row.pairing_code_expires_at) < new Date()
  ) {
    return NextResponse.json({
      ok: false,
      error: 'That code has expired. Ask for a new one.',
    })
  }

  await admin
    .from('signage_screens')
    .update({
      pairing_code: null,
      pairing_code_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)

  return NextResponse.json({
    ok: true,
    token: row.player_token,
    nickname: row.nickname,
  })
}
