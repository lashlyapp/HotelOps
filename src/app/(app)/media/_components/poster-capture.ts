/**
 * Render a still frame from a video to a JPEG blob, used as the catalog
 * thumbnail. Accepts either a local File (during upload) or a public URL
 * (background-fill for legacy videos that have no persisted poster yet).
 *
 * Why not just rely on `<video preload="metadata" src="...#t=0.1">` in the
 * card? With preload="metadata" the browser stops at HAVE_METADATA and never
 * paints a frame, so the card renders as a black rectangle in Chrome and
 * Safari. Same reason `loadeddata` can't be used as the trigger here — it
 * fires at HAVE_CURRENT_DATA, which `preload="metadata"` never reaches. We
 * load metadata, then explicitly seek; the `seeked` event guarantees there
 * is a frame to draw.
 *
 * For URL sources we set `crossOrigin="anonymous"` so canvas isn't tainted.
 * R2 CORS allows GET from the app origins (see infra/r2-cors.json); if a
 * deploy ever hits an origin not on that list, the load will fail and we
 * resolve null so callers can fall back gracefully.
 */
export function capturePosterBlob(source: File | string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    let objectUrl: string | null = null

    if (typeof source === 'string') {
      video.crossOrigin = 'anonymous'
      video.src = source
    } else {
      objectUrl = URL.createObjectURL(source)
      video.src = objectUrl
    }
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true

    let settled = false
    const cleanup = () => {
      video.removeAttribute('src')
      video.load()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    const settle = (blob: Blob | null) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(blob)
    }

    // Hard ceiling for unsupported codecs / network failures / CORS denials.
    const timeout = setTimeout(() => settle(null), 15_000)

    const drawFrame = () => {
      try {
        const w = video.videoWidth
        const h = video.videoHeight
        if (!w || !h) {
          clearTimeout(timeout)
          settle(null)
          return
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          clearTimeout(timeout)
          settle(null)
          return
        }
        ctx.drawImage(video, 0, 0, w, h)
        canvas.toBlob(
          (blob) => {
            clearTimeout(timeout)
            settle(blob)
          },
          'image/jpeg',
          0.85,
        )
      } catch {
        clearTimeout(timeout)
        settle(null)
      }
    }

    video.addEventListener('seeked', drawFrame, { once: true })
    video.addEventListener('loadedmetadata', () => {
      // Seek slightly past 0 — frame 0 is a black slate on some encodes.
      const target = Math.min(0.1, (video.duration || 1) / 2)
      try {
        video.currentTime = target
      } catch {
        // Some browsers refuse a seek before duration is known; fall back to
        // drawing whatever frame is currently decoded.
        drawFrame()
      }
    })
    video.addEventListener('error', () => {
      clearTimeout(timeout)
      settle(null)
    })
  })
}
