'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

const STRIP_FRAME_COUNT = 8
const POSTER_MAX_WIDTH = 1280
const POSTER_QUALITY = 0.85

export type CoverPickerResult = {
  // JPEG of the chosen frame, ready to PUT to R2.
  poster: Blob
  // Time (in seconds) the user selected — surfaced to the caller for UI/logs.
  capturedAt: number
}

export type CoverPickerError =
  | { kind: 'undecodable' } // browser couldn't decode the file (HEVC on Chrome, etc.)
  | { kind: 'aborted' }

/**
 * TikTok-style cover picker. Loads the video file as an object URL into a
 * hidden <video>, generates an evenly-spaced thumbnail strip, and lets the
 * user click a thumbnail or scrub the timeline to pick the cover. On confirm
 * we draw the current frame to a canvas and hand back a JPEG Blob.
 *
 * `onResolve` is called exactly once: with `{ poster, capturedAt }` if the
 * user picks a frame, or with an error otherwise. The caller is expected to
 * unmount us after either outcome.
 */
export function CoverPicker({
  file,
  onResolve,
}: {
  file: File
  onResolve: (
    result: { ok: true; value: CoverPickerResult } | { ok: false; error: CoverPickerError },
  ) => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [thumbnails, setThumbnails] = useState<Array<{ time: number; dataUrl: string }>>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Object URL: created once on mount, revoked on unmount. Drop-zone keys
  // each picker by jobId so a new file always gets a fresh component.
  const [objectUrl] = useState(() =>
    typeof window === 'undefined' ? '' : URL.createObjectURL(file),
  )
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  // Generate the thumbnail strip once the video has metadata.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let cancelled = false

    async function build() {
      try {
        await waitForMetadata(video!)
      } catch {
        if (!cancelled) onResolve({ ok: false, error: { kind: 'undecodable' } })
        return
      }
      if (video!.videoWidth === 0 || video!.videoHeight === 0) {
        // Browser can't decode the codec (typical for iPhone HEVC .mov on
        // Chrome/Firefox). The catch-the-error path above misses this case
        // because metadata loads "successfully" but reports 0×0.
        if (!cancelled) onResolve({ ok: false, error: { kind: 'undecodable' } })
        return
      }

      const dur = Number.isFinite(video!.duration) ? video!.duration : 0
      if (!cancelled) {
        setDuration(dur > 0 ? dur : null)
        setCurrentTime(Math.min(1, dur || 0))
      }

      // Pick frame times evenly across the timeline; clamp the last sample
      // off the very end (some encoders emit an empty trailing sample).
      const frames: Array<{ time: number; dataUrl: string }> = []
      const usable = dur > 0 ? Math.max(0, dur - 0.05) : 0
      for (let i = 0; i < STRIP_FRAME_COUNT; i += 1) {
        if (cancelled) return
        const t = (usable * i) / (STRIP_FRAME_COUNT - 1)
        try {
          const dataUrl = await captureFrame(video!, t, 240)
          if (cancelled) return
          frames.push({ time: t, dataUrl })
          // Update the strip incrementally so the user sees progress instead
          // of staring at an empty row for a few seconds.
          setThumbnails([...frames])
        } catch {
          // Skip frames the browser can't decode at this offset; keep going.
        }
      }
      // After the strip is built, leave the video parked at the first frame
      // so the live preview matches the "selected" thumbnail by default.
      if (!cancelled) {
        try {
          await seek(video!, frames[0]?.time ?? 0)
          setCurrentTime(frames[0]?.time ?? 0)
        } catch {
          // ignore
        }
      }
    }

    build()
    return () => {
      cancelled = true
    }
  }, [onResolve])

  async function selectTime(t: number) {
    const video = videoRef.current
    if (!video) return
    try {
      await seek(video, t)
      setCurrentTime(t)
      setError(null)
    } catch {
      setError('Could not seek to that frame.')
    }
  }

  async function confirm() {
    const video = videoRef.current
    if (!video) return
    setBusy(true)
    setError(null)
    try {
      const poster = await captureFrameBlob(video, currentTime, POSTER_MAX_WIDTH)
      onResolve({ ok: true, value: { poster, capturedAt: currentTime } })
    } catch {
      setError('Could not capture this frame. Try a different one.')
      setBusy(false)
    }
  }

  function cancel() {
    onResolve({ ok: false, error: { kind: 'aborted' } })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a cover image"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="bg-surface text-fg w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-lg shadow-lg flex flex-col">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">Choose a cover image</h2>
            <p className="text-xs text-subtle">
              Pick a frame from <span className="font-mono">{file.name}</span> —
              this is what guests see in the catalog and on your website.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={cancel} disabled={busy}>
            Cancel
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
            <video
              ref={videoRef}
              src={objectUrl || undefined}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full object-contain"
            />
          </div>

          {duration !== null ? (
            <div className="space-y-2">
              <label className="block">
                <span className="text-xs uppercase tracking-wider text-subtle">
                  Scrub to fine-tune ({formatTime(currentTime)} /{' '}
                  {formatTime(duration)})
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.05}
                  value={currentTime}
                  onChange={(e) => {
                    void selectTime(Number(e.target.value))
                  }}
                  className="mt-1 w-full accent-fg"
                  aria-label="Cover frame position"
                />
              </label>
            </div>
          ) : (
            <p className="text-xs text-subtle">Loading frames…</p>
          )}

          {thumbnails.length > 0 ? (
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-subtle">
                Suggestions
              </p>
              <ul className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {thumbnails.map((thumb) => {
                  const active = Math.abs(thumb.time - currentTime) < 0.05
                  return (
                    <li key={thumb.time}>
                      <button
                        type="button"
                        onClick={() => {
                          void selectTime(thumb.time)
                        }}
                        aria-label={`Use frame at ${formatTime(thumb.time)}`}
                        className={
                          'focus-ring relative block aspect-video w-full overflow-hidden rounded-sm border-2 ' +
                          (active
                            ? 'border-fg'
                            : 'border-transparent hover:border-border-default')
                        }
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumb.dataUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
          <Button variant="ghost" size="sm" onClick={cancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={confirm} disabled={busy || duration === null}>
            {busy ? 'Capturing…' : 'Use this frame'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Video metadata failed to load'))
    }
    function cleanup() {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('error', onError)
  })
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  // Already at the target — Safari sometimes doesn't fire `seeked` for
  // sub-frame deltas, so short-circuit.
  if (Math.abs(video.currentTime - time) < 0.001) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Seek failed'))
    }
    function cleanup() {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.currentTime = time
  })
}

async function captureFrame(
  video: HTMLVideoElement,
  time: number,
  maxWidth: number,
): Promise<string> {
  await seek(video, time)
  const { canvas } = drawFrame(video, maxWidth)
  return canvas.toDataURL('image/jpeg', 0.7)
}

async function captureFrameBlob(
  video: HTMLVideoElement,
  time: number,
  maxWidth: number,
): Promise<Blob> {
  await seek(video, time)
  const { canvas } = drawFrame(video, maxWidth)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas produced no blob'))
      },
      'image/jpeg',
      POSTER_QUALITY,
    )
  })
}

function drawFrame(
  video: HTMLVideoElement,
  maxWidth: number,
): { canvas: HTMLCanvasElement } {
  const ratio =
    video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1
  const w = Math.round(video.videoWidth * ratio)
  const h = Math.round(video.videoHeight * ratio)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  ctx.drawImage(video, 0, 0, w, h)
  return { canvas }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
