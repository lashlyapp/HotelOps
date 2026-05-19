import { NextResponse, type NextRequest } from 'next/server'
import { buildAdapterContext } from '@/lib/market/sources/context'
import { verifyCronAuth } from '@/lib/market/sources/cron-auth'
import { openMeteoAdapter } from '@/lib/market/sources/open-meteo'
import { runAdapter } from '@/lib/market/sources/runner'
import { normalizeWeather } from '@/lib/market/normalizers/weather'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = verifyCronAuth(request)
  if (!auth.ok) return auth.response

  const ctx = await buildAdapterContext()
  const result = await runAdapter(openMeteoAdapter, ctx, { trigger: 'cron' })
  const normalized = result.status !== 'skipped' && result.observations_written > 0
    ? await normalizeWeather()
    : 0

  return NextResponse.json({ ok: true, result, normalized })
}
