import { NextResponse, type NextRequest } from 'next/server'
import { requireOrgUser } from '@/lib/auth/session'
import { streamCreateTusUpload } from '@/lib/stream/client'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * tus CREATE proxy for Cloudflare Stream Direct Creator Uploads.
 *
 * tus-js-client running in the browser uses this route as its `endpoint`.
 * On upload start it sends an empty POST with `Tus-Resumable`,
 * `Upload-Length`, and `Upload-Metadata`; we forward those to Stream
 * server-side (with our API token attached), then return the Cloudflare
 * Location to the browser. The chunk PATCHes go straight to Cloudflare —
 * `direct_user=true` makes that endpoint accept browser uploads from any
 * origin, so we only need to proxy the create.
 *
 * This shape matches the Cloudflare-recommended pattern; before this
 * route existed we returned the Location URL via a server action and let
 * tus-js-client PATCH it directly, which fails CORS preflight because
 * the create-time URL is not the same as the chunk-upload URL.
 */
// Force Node.js runtime — Buffer and the Stream API client are Node-only,
// and we want server-side console.error to reach Vercel's function logs.
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const session = await requireOrgUser()
  const propertyId = new URL(request.url).searchParams.get('propertyId')
  if (!propertyId) {
    console.error('[stream-upload] missing propertyId')
    return new NextResponse('Missing propertyId', { status: 400 })
  }
  const property = session.properties.find((p) => p.id === propertyId)
  if (!property) {
    console.error('[stream-upload] property not found', { propertyId })
    return new NextResponse('Property not found', { status: 404 })
  }

  const uploadLength = Number(request.headers.get('Upload-Length'))
  const uploadMetadata = request.headers.get('Upload-Metadata') ?? ''
  if (!Number.isFinite(uploadLength) || uploadLength <= 0) {
    console.error('[stream-upload] invalid Upload-Length', {
      raw: request.headers.get('Upload-Length'),
    })
    return new NextResponse('Invalid Upload-Length', { status: 400 })
  }
  // Stream's hard ceiling is 30 GB / 8 hours.
  const MAX_VIDEO_BYTES = 30 * 1024 * 1024 * 1024
  if (uploadLength > MAX_VIDEO_BYTES) {
    return new NextResponse('Video exceeds 30 GB limit', { status: 413 })
  }

  // The filename comes from tus's Upload-Metadata. tus-js-client and
  // Cloudflare Stream both use the `name` key (not `filename`); fall back
  // to `filename` only for callers that follow the older tus convention.
  const meta = decodeTusMetadata(uploadMetadata)
  const filename = meta.get('name') ?? meta.get('filename') ?? 'video'

  let init: { uploadUrl: string; uid: string }
  try {
    init = await streamCreateTusUpload({
      filename,
      size: uploadLength,
      uploadMetadata,
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Stream upload init failed'
    // Surfaces the upstream Cloudflare status + body to Vercel's Logs view
    // so the response body isn't the only place the error lives.
    console.error('[stream-upload] cloudflare init failed', {
      propertyId,
      filename,
      uploadLength,
      hasAccountId: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID),
      hasApiToken: Boolean(process.env.CLOUDFLARE_API_TOKEN),
      message,
    })
    return new NextResponse(message, { status: 502 })
  }

  // Track the in-flight upload so the catalog can list it (with an
  // "Encoding…" placeholder) even before Cloudflare finishes processing.
  const admin = createAdminClient()
  const { error: insertError } = await admin.from('media_videos').insert({
    property_id: propertyId,
    stream_uid: init.uid,
    filename,
    size: uploadLength,
    status: 'pending',
  })
  if (insertError) {
    console.error('[stream-upload] media_videos insert failed', {
      propertyId,
      uid: init.uid,
      message: insertError.message,
    })
    return new NextResponse(insertError.message, { status: 500 })
  }

  // tus expects 201 Created with the upload URL in the Location header.
  // Access-Control-Expose-Headers lets the browser's tus client read
  // Location even though this is technically a same-origin response —
  // tus-js-client uses the same code path as cross-origin and looks at
  // the exposed headers list.
  return new NextResponse(null, {
    status: 201,
    headers: {
      Location: init.uploadUrl,
      'stream-media-id': init.uid,
      'Access-Control-Expose-Headers': 'Location, stream-media-id, Tus-Resumable',
      'Tus-Resumable': '1.0.0',
    },
  })
}

function decodeTusMetadata(header: string): Map<string, string> {
  const out = new Map<string, string>()
  if (!header) return out
  for (const pair of header.split(',')) {
    const [key, value] = pair.trim().split(/\s+/, 2)
    if (!key) continue
    try {
      out.set(key, value ? Buffer.from(value, 'base64').toString('utf8') : '')
    } catch {
      // Ignore malformed entries — filename gets a default in the caller.
    }
  }
  return out
}
