import { NextResponse, type NextRequest } from 'next/server'
import QRCode from 'qrcode'

export const runtime = 'nodejs'

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * GET /api/arrival/qr/<slug>?size=1024
 *
 * Server-renders a PNG QR code that encodes the absolute /a/<slug> URL.
 * Used by the printable card. PNG cached at the CDN for a day; the only
 * input is the slug + size + site origin, none of which change often.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  if (!SLUG_RE.test(slug) || slug.length > 64) {
    return new NextResponse('bad slug', { status: 400 })
  }
  const size = Math.min(
    Math.max(Number.parseInt(req.nextUrl.searchParams.get('size') ?? '512', 10), 128),
    1600,
  )
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ??
    req.nextUrl.origin
  const url = `${origin}/a/${encodeURIComponent(slug)}`
  const png = await QRCode.toBuffer(url, {
    type: 'png',
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
  })
  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      // Cache aggressively: regenerating is cheap but the printed card
      // is what the guest sees; we want the CDN to absorb scan traffic.
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}
