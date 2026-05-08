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
 * Mint a tus-resumable Direct Creator Upload URL. The browser's tus client
 * sends the initial CREATE through our route handler (which adds the API
 * token); we forward to Cloudflare and return Location. The chunk PATCHes
 * then go straight to Cloudflare — `direct_user=true` makes that endpoint
 * browser-uploadable from any origin.
 *
 * `uploadMetadata` is the raw base64-url-encoded tus header from the client
 * (so filenames with non-ASCII characters round-trip cleanly). If absent we
 * synthesize one from the explicit filename.
 */
export async function streamCreateTusUpload(args: {
  filename: string
  size: number
  uploadMetadata?: string
  // Stream's cap is generous (30 GB / 8 hours); pass through whatever the
  // caller's policy allows so a misconfigured client surface a clear error.
  maxDurationSeconds?: number
}): Promise<{ uploadUrl: string; uid: string }> {
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  const url = `${STREAM_API}/client/v4/accounts/${accountId}/stream?direct_user=true`

  const metadata =
    args.uploadMetadata && args.uploadMetadata.length > 0
      ? args.uploadMetadata
      : (() => {
          const pairs: Array<[string, string]> = [['name', args.filename]]
          if (args.maxDurationSeconds) {
            pairs.push(['maxDurationSeconds', String(args.maxDurationSeconds)])
          }
          return pairs.map(([k, v]) => `${k} ${b64(v)}`).join(',')
        })()

  const res = await fetch(url, {
    method: 'POST',
    headers: streamHeaders({
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(args.size),
      'Upload-Metadata': metadata,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Stream tus init failed (${res.status}): ${text}`)
  }
  const rawLocation = res.headers.get('Location')
  const uid = res.headers.get('stream-media-id')
  if (!rawLocation || !uid) {
    throw new Error('Stream tus init: missing Location / stream-media-id headers')
  }
  // Cloudflare normally returns an absolute URL, but tus permits relative
  // — resolve against the API host so the browser doesn't accidentally
  // resolve against its own origin.
  const uploadUrl = new URL(rawLocation, STREAM_API).toString()
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

/**
 * Ask Stream to start generating a downloadable MP4 for this video.
 * Idempotent on Cloudflare's side — calling it twice is safe. The MP4
 * isn't available immediately; Cloudflare returns the current state in
 * the response (usually "inprogress" right after we ask, then "ready"
 * once the file is built). The catalog "Download" button hits the static
 * `/downloads/default.mp4` URL, which 404s until the build finishes — a
 * fine UX given downloads are an explicit user action.
 *
 * Stream requires the video to be `readyToStream` first; call this only
 * after `streamGetVideo(uid).readyToStream === true`.
 */
export async function streamEnableMp4Download(uid: string): Promise<void> {
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  const res = await fetch(
    `${STREAM_API}/client/v4/accounts/${accountId}/stream/${uid}/downloads`,
    { method: 'POST', headers: streamHeaders() },
  )
  // 200 on first request, 200 on subsequent (state echoed back). 409-style
  // races on parallel calls are rare enough not to block; surface other
  // errors so the catalog can log them.
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Stream enable-download failed (${res.status}): ${text}`)
  }
}

function b64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64')
}
