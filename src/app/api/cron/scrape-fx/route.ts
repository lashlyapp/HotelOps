import { NextResponse, type NextRequest } from 'next/server'
import { normalizeFx } from '@/lib/market/normalizers/fx'
import { buildAdapterContext } from '@/lib/market/sources/context'
import { verifyCronAuth } from '@/lib/market/sources/cron-auth'
import { exchangeRateAdapter } from '@/lib/market/sources/exchange-rate'
import { runAdapter } from '@/lib/market/sources/runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = verifyCronAuth(request)
  if (!auth.ok) return auth.response
  const ctx = await buildAdapterContext()
  const result = await runAdapter(exchangeRateAdapter, ctx, { trigger: 'cron' })
  const normalized = result.status !== 'skipped' && result.observations_written > 0
    ? await normalizeFx()
    : 0
  return NextResponse.json({ ok: true, result, normalized })
}
