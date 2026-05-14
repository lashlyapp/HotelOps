import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type HeartbeatBody = {
  token?: unknown
  current_item_id?: unknown
}

/**
 * POST { token, current_item_id? } — the player reports liveness every
 * 60s. We update last_heartbeat_at, the user-agent, and the currently-
 * playing item id so the operator UI can show what's on each screen.
 *
 * Auth is the opaque token only. Operators rotate it via "unpair", which
 * invalidates any in-the-wild URL immediately.
 */
export async function POST(req: NextRequest) {
  let body: HeartbeatBody
  try {
    body = (await req.json()) as HeartbeatBody
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }
  const token = typeof body.token === 'string' ? body.token : ''
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'bad_token' }, { status: 400 })
  }
  const currentItemId =
    typeof body.current_item_id === 'string' && body.current_item_id.length > 0
      ? body.current_item_id
      : null

  const admin = createAdminClient()
  const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 400)
  const { data, error } = await admin
    .from('signage_screens')
    .update({
      last_heartbeat_at: new Date().toISOString(),
      last_user_agent: userAgent,
      current_item_id: currentItemId,
    })
    .eq('player_token', token)
    .select('id')
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
