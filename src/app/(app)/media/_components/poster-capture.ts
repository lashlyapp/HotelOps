/**
 * Render a still frame from a video to a JPEG blob, used as the catalog
 * thumbnail. Accepts either a local File (during upload) or a public URL
 * (background-fill for legacy videos that have no persisted poster yet).
 *
 * Why not just rely on `<video preload="metadata" src="...#t=0.1">` in the
 * card? With preload="metadata" the browser stops at HAVE_METADATA and never
 * paints a frame, so the card renders as a black rectangle in Chrome and
 * Safari. We load metadata, seek into the clip, and wait for the seeked
 * frame to actually be *presented* before drawing — `seeked` only means the
 * seek has landed; under CPU pressure (e.g. multiple concurrent captures
 * during a bulk upload) the frame is often not yet decoded when the event
 * fires, producing a black thumbnail. requestVideoFrameCallback bridges that
 * gap; on browsers without it, two paired rAFs do the same job.
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
    const timeout = setTimeout(() => {
      console.warn('[poster-capture] timeout', {
        readyState: video.readyState,
        currentTime: video.currentTime,
        duration: video.duration,
      })
      settle(null)
    }, 20_000)

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
      } catch (err) {
        console.warn('[poster-capture] draw error', err)
        clearTimeout(timeout)
        settle(null)
      }
    }

    const waitForFrameAndDraw = () => {
      const v = video as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number
      }
      if (typeof v.requestVideoFrameCallback === 'function') {
        v.requestVideoFrameCallback(() => drawFrame())
      } else {
        // Two paired rAFs: by the second tick the seeked frame has been
        // composited and is visible to drawImage on browsers without rVFC.
        requestAnimationFrame(() => requestAnimationFrame(drawFrame))
      }
    }

    video.addEventListener('seeked', waitForFrameAndDraw, { once: true })
    video.addEventListener(
      'loadedmetadata',
      () => {
        // Seek a bit into the clip rather than to t=0: many videos open with
        // a fade-in or one or two black frames. Half a second is a safer
        // sample but bounded for very short clips.
        const duration = video.duration
        const target =
          Number.isFinite(duration) && duration > 0
            ? Math.min(0.5, Math.max(0.05, duration / 4))
            : 0.5
        try {
          video.currentTime = target
        } catch {
          // Some browsers refuse a seek before duration is known; fall back
          // to drawing whatever frame is currently decoded.
          waitForFrameAndDraw()
        }
      },
      { once: true },
    )
    video.addEventListener('error', () => {
      console.warn('[poster-capture] video error', video.error)
      clearTimeout(timeout)
      settle(null)
    })
  })
}
