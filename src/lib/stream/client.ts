import 'server-only'

/**
 * Thin wrapper over the subset of the Cloudflare Stream API the catalog
 * needs: minting Direct Creator Upload tokens (tus-resumable, so files
 * larger than 200 MB still go straight from the browser to Cloudflare),
 * fetching per-video metadata, and deleting on user request.
 *
 * Public asset URLs (thumbnails / iframe / HLS) are constructed from the
 * customer subdomain — Stream serves those without API calls.
 */

const STREAM_API = 'https://api.cloudflare.com'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

function streamHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${requireEnv('CLOUDFLARE_API_TOKEN')}`,
    ...extra,
  }
}

export function streamSubdomain(): string {
  // Caller should pass just the host (e.g. customer-abc123.cloudflarestream.com).
  // Strip protocol/trailing slash defensively in case someone pastes a full URL.
  return requireEnv('CLOUDFLARE_STREAM_SUBDOMAIN')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
}

/**
 * Build the static thumbnail URL Stream serves at the edge.
 * Free, edge-cached, no API call needed.
 */
export function streamThumbnailUrl(
  uid: string,
  opts: { time?: string; height?: number; width?: number } = {},
): string {
  const params = new URLSearchParams()
  params.set('time', opts.time ?? '1s')
  if (opts.height) params.set('height', String(opts.height))
  if (opts.width) params.set('width', String(opts.width))
  return `https://${streamSubdomain()}/${uid}/thumbnails/thumbnail.jpg?${params.toString()}`
}

export function streamIframeUrl(uid: string): string {
  return `https://${streamSubdomain()}/${uid}/iframe`
}

export function streamMp4DownloadUrl(uid: string): string {
  // Requires "downloads" to be enabled per video (see streamEnableMp4Download).
  return `https://${streamSubdomain()}/${uid}/downloads/default.mp4`
}

/**
 * Mint a tus-resumable Direct Creator Upload URL. The browser then drives
 * the upload via tus-js-client; the file never round-trips through Vercel.
 *
 * Cloudflare returns the tus upload URL in the `Location` header and the
 * future video UID in `stream-media-id`. The response body is empty, so we
 * have to read those headers directly.
 */
export async function streamCreateTusUpload(args: {
  filename: string
  size: number
  // Stream's cap is generous (30 GB / 8 hours); pass through whatever the
  // caller's policy allows so a misconfigured client surface a clear error.
  maxDurationSeconds?: number
}): Promise<{ uploadUrl: string; uid: string }> {
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  const url = `${STREAM_API}/client/v4/accounts/${accountId}/stream?direct_user=true`

  // Stream reads filename + maxDurationSeconds from a base64-url-encoded
  // tus "Upload-Metadata" header.
  const metaPairs: Array<[string, string]> = [['name', args.filename]]
  if (args.maxDurationSeconds) {
    metaPairs.push(['maxDurationSeconds', String(args.maxDurationSeconds)])
  }
  const uploadMetadata = metaPairs
    .map(([k, v]) => `${k} ${b64(v)}`)
    .join(',')

  const res = await fetch(url, {
    method: 'POST',
    headers: streamHeaders({
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(args.size),
      'Upload-Metadata': uploadMetadata,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Stream tus init failed (${res.status}): ${text}`)
  }
  const uploadUrl = res.headers.get('Location')
  const uid = res.headers.get('stream-media-id')
  if (!uploadUrl || !uid) {
    throw new Error('Stream tus init: missing Location / stream-media-id headers')
  }
  return { uploadUrl, uid }
}

export type StreamVideoStatus = 'pendingupload' | 'queued' | 'inprogress' | 'ready' | 'error'

export type StreamVideo = {
  uid: string
  status: StreamVideoStatus
  duration: number | null
  size: number
  meta: Record<string, string>
  readyToStream: boolean
}

export async function streamGetVideo(uid: string): Promise<StreamVideo | null> {
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  const res = await fetch(
    `${STREAM_API}/client/v4/accounts/${accountId}/stream/${uid}`,
    { headers: streamHeaders() },
  )
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Stream get failed (${res.status}): ${text}`)
  }
  const json = (await res.json()) as {
    result: {
      uid: string
      status: { state: StreamVideoStatus }
      duration: number | null
      size: number
      meta: Record<string, string>
      readyToStream: boolean
    }
  }
  const r = json.result
  return {
    uid: r.uid,
    status: r.status.state,
    duration: r.duration,
    size: r.size,
    meta: r.meta ?? {},
    readyToStream: r.readyToStream,
  }
}

export async function streamDeleteVideo(uid: string): Promise<void> {
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  const res = await fetch(
    `${STREAM_API}/client/v4/accounts/${accountId}/stream/${uid}`,
    { method: 'DELETE', headers: streamHeaders() },
  )
  // 200 on success, 404 acceptable (already gone).
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '')
    throw new Error(`Stream delete failed (${res.status}): ${text}`)
  }
}

function b64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64')
}
