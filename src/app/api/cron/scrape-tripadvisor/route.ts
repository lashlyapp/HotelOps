import { NextResponse, type NextRequest } from 'next/server'
import { normalizeReviews } from '@/lib/market/normalizers/reviews'
import { buildAdapterContext } from '@/lib/market/sources/context'
import { verifyCronAuth } from '@/lib/market/sources/cron-auth'
import { tripadvisorAdapter } from '@/lib/market/sources/tripadvisor'
import { runAdapter } from '@/lib/market/sources/runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = verifyCronAuth(request)
  if (!auth.ok) return auth.response
  const ctx = await buildAdapterContext()
  const result = await runAdapter(tripadvisorAdapter, ctx, { trigger: 'cron' })
  const normalized = result.status !== 'skipped' && result.observations_written > 0
    ? await normalizeReviews()
    : 0
  return NextResponse.json({ ok: true, result, normalized })
}
