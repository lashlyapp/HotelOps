import { NextResponse, type NextRequest } from 'next/server'
import { normalizeRates } from '@/lib/market/normalizers/rates'
import { buildAdapterContext } from '@/lib/market/sources/context'
import { verifyCronAuth } from '@/lib/market/sources/cron-auth'
import { expediaRapidAdapter } from '@/lib/market/sources/expedia-rapid'
import { runAdapter } from '@/lib/market/sources/runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = verifyCronAuth(request)
  if (!auth.ok) return auth.response
  const ctx = await buildAdapterContext()
  const result = await runAdapter(expediaRapidAdapter, ctx, { trigger: 'cron' })
  const normalized = result.status !== 'skipped' && result.observations_written > 0
    ? await normalizeRates()
    : 0
  return NextResponse.json({ ok: true, result, normalized })
}
