import { NextResponse, type NextRequest } from 'next/server'
import { buildAdapterContext } from '@/lib/market/sources/context'
import { verifyCronAuth } from '@/lib/market/sources/cron-auth'
import { nagerHolidaysAdapter } from '@/lib/market/sources/nager-holidays'
import { runAdapter } from '@/lib/market/sources/runner'
import { normalizeHolidays } from '@/lib/market/normalizers/holidays'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = verifyCronAuth(request)
  if (!auth.ok) return auth.response

  const ctx = await buildAdapterContext()
  const result = await runAdapter(nagerHolidaysAdapter, ctx, { trigger: 'cron' })
  const normalized = result.status !== 'skipped' && result.observations_written > 0
    ? await normalizeHolidays()
    : 0

  return NextResponse.json({ ok: true, result, normalized })
}
