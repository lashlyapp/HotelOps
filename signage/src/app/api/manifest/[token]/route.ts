import { NextResponse, type NextRequest } from 'next/server'
import { loadManifestByToken } from '@/lib/manifest'

// The player polls this every 60s (server-driven via Manifest.poll_ms).
// Force-dynamic since the response varies with `now()`.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const result = await loadManifestByToken(token)
  if (!result.ok) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json(result.manifest, {
    headers: {
      // Edge-cacheable for a few seconds so a rapid restart loop on a
      // single screen doesn't hammer Supabase, but short enough that a
      // playlist change shows up within one poll.
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  })
}
