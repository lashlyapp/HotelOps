import { NextResponse, type NextRequest } from 'next/server'
import { normalizeVenues } from '@/lib/market/normalizers/venues'
import { buildAdapterContext } from '@/lib/market/sources/context'
import { verifyCronAuth } from '@/lib/market/sources/cron-auth'
import { overpassVenuesAdapter } from '@/lib/market/sources/overpass'
import { runAdapter } from '@/lib/market/sources/runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = verifyCronAuth(request)
  if (!auth.ok) return auth.response
  const ctx = await buildAdapterContext()
  const result = await runAdapter(overpassVenuesAdapter, ctx, { trigger: 'cron' })
  const normalized = result.status !== 'skipped' && result.observations_written > 0
    ? await normalizeVenues()
    : { venues: 0, competitors: 0 }
  return NextResponse.json({ ok: true, result, normalized })
}
