import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Gated PDF delivery for lead-magnet guides. Verifies the `t` query
 * param against guide_leads.download_token, looks up the file on
 * disk (bundled via next.config.ts → outputFileTracingIncludes),
 * and streams it with a friendly filename.
 *
 * Returns 404 on every failure mode (missing token, no matching
 * lead, unknown slug, missing file). We deliberately do not
 * distinguish between "token does not exist" and "file does not
 * exist" because doing so would leak which guides are real and
 * which tokens once existed.
 *
 * Download count + last_downloaded_at are bumped on every verified
 * hit, fire-and-forget. The response itself is not gated on those
 * updates — if Supabase is slow, the file still streams.
 */
const ASSETS_DIR = path.resolve(process.cwd(), 'assets/downloads')

const GUIDES: Record<string, { filename: string; humanName: string }> = {
  '10-ways-modernize-boutique-hotel': {
    filename: '10-ways-modernize-boutique-hotel.pdf',
    humanName: '10 ways to modernize your boutique hotel.pdf',
  },
}

export async function GET(req: NextRequest): Promise<Response> {
  const token = req.nextUrl.searchParams.get('t')?.trim()
  if (!token) return notFound()

  // UUID shape check before going to the DB — keeps malformed-input
  // probes from showing up as Supabase errors in the logs.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return notFound()
  }

  const admin = createAdminClient()
  const { data: lead, error } = await admin
    .from('guide_leads')
    .select('id, guide_slug, download_count')
    .eq('download_token', token)
    .maybeSingle()

  if (error) {
    console.error('[guide-download] lookup failed', error)
    return notFound()
  }
  if (!lead) return notFound()

  const guide = GUIDES[lead.guide_slug]
  if (!guide) return notFound()

  const filePath = path.join(ASSETS_DIR, guide.filename)
  let body: Buffer
  try {
    body = await readFile(filePath)
  } catch (err) {
    console.error('[guide-download] read failed', filePath, err)
    return notFound()
  }

  // Bump counters fire-and-forget. The downloaded file is what the
  // user came for; observability is secondary.
  void admin
    .from('guide_leads')
    .update({
      download_count: (lead.download_count ?? 0) + 1,
      last_downloaded_at: new Date().toISOString(),
    })
    .eq('id', lead.id)

  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(body.length),
      'Content-Disposition': `attachment; filename="${guide.humanName}"`,
      // Don't let CDNs cache a per-token response; bandwidth is cheap.
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

function notFound(): Response {
  return new Response('Not found.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain' },
  })
}
