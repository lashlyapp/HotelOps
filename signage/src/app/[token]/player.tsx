'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Manifest, ResolvedItem } from '@/lib/manifest'

const HEARTBEAT_INTERVAL_MS = 60_000
const REFRESH_BACKOFF_MIN_MS = 5_000
const REFRESH_BACKOFF_MAX_MS = 60_000

export function Player({
  token,
  initial,
}: {
  token: string
  initial: Manifest
}) {
  const [manifest, setManifest] = useState(initial)
  const [cursor, setCursor] = useState(0)

  // Apply the hide-cursor class only on the player page so the pair
  // form on / stays usable. Document classes don't reset on navigation
  // so we toggle on mount/unmount.
  useEffect(() => {
    document.body.classList.add('player')
    return () => {
      document.body.classList.remove('player')
    }
  }, [])

  // Poll the manifest. If the generation string changes, swap in the new
  // playlist and reset the cursor.
  useEffect(() => {
    let cancelled = false
    let backoff = REFRESH_BACKOFF_MIN_MS
    let timer: ReturnType<typeof setTimeout> | null = null
    async function tick() {
      try {
        const res = await fetch(`/api/manifest/${token}`, {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const next = (await res.json()) as Manifest
        if (cancelled) return
        backoff = REFRESH_BACKOFF_MIN_MS
        setManifest((prev) => {
          if (prev.generation === next.generation) return prev
          setCursor(0)
          return next
        })
      } catch {
        // Network failures are common in hotels with patchy Wi-Fi. Back off
        // exponentially up to 60s so the player doesn't hammer the API
        // during an outage; the last good manifest stays on screen so the
        // TV keeps cycling content offline.
        backoff = Math.min(backoff * 2, REFRESH_BACKOFF_MAX_MS)
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, manifest.poll_ms || backoff)
        }
      }
    }
    timer = setTimeout(tick, manifest.poll_ms)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [manifest.poll_ms, token])

  // Heartbeat — independent timer so a slow manifest poll doesn't block
  // the liveness signal.
  useEffect(() => {
    let cancelled = false
    const current = manifest.items[cursor]
    async function send() {
      try {
        await fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            current_item_id: current?.id ?? null,
          }),
          keepalive: true,
        })
      } catch {
        // ignore — operator already sees the screen as offline if heartbeats stop.
      }
    }
    void send()
    const interval = setInterval(() => {
      if (cancelled) return
      void send()
    }, HEARTBEAT_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [token, manifest.items, cursor])

  // Cycle through items. Video items use the <video onEnded> path; everything
  // else uses a timeout based on duration_seconds.
  const advance = useCallback(() => {
    setCursor((c) => {
      if (manifest.items.length === 0) return 0
      return (c + 1) % manifest.items.length
    })
  }, [manifest.items.length])

  useEffect(() => {
    const item = manifest.items[cursor]
    if (!item) return
    if (item.kind === 'video') return // <video> drives advance via onEnded.
    const t = setTimeout(advance, item.duration_seconds * 1000)
    return () => clearTimeout(t)
  }, [cursor, manifest.items, advance])

  const current = manifest.items[cursor]
  const showEmergency = useMemo(() => {
    if (!manifest.emergency) return false
    return new Date(manifest.emergency.until) > new Date()
  }, [manifest.emergency])

  if (showEmergency && manifest.emergency) {
    return <Emergency message={manifest.emergency.message} />
  }

  if (!current) {
    return <StandbyScreen nickname={manifest.screen.nickname} />
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <ItemView item={current} onEnded={advance} />
    </div>
  )
}

function ItemView({
  item,
  onEnded,
}: {
  item: ResolvedItem
  onEnded: () => void
}) {
  const ref = useRef<HTMLVideoElement | null>(null)
  // Reset the video element whenever the source changes so autoplay
  // re-triggers reliably on Fire TV / Tizen browsers.
  useEffect(() => {
    if (item.kind !== 'video') return
    const el = ref.current
    if (!el) return
    el.currentTime = 0
    void el.play().catch(() => {
      // Autoplay blocked (rare on TVs). Move on so the playlist doesn't stall.
      onEnded()
    })
  }, [item, onEnded])

  switch (item.kind) {
    case 'image':
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url!}
          alt=""
          className="h-full w-full object-contain"
        />
      )
    case 'video':
      return (
        <video
          ref={ref}
          src={item.url}
          poster={item.poster_url ?? undefined}
          autoPlay
          muted
          playsInline
          onEnded={onEnded}
          className="h-full w-full object-contain bg-black"
        />
      )
    case 'web':
      return (
        <iframe
          src={item.url}
          // No allow-same-origin / allow-scripts unless explicitly needed —
          // operators paste URLs and we shouldn't let one of them XSS the
          // signage subdomain.
          sandbox="allow-scripts allow-popups allow-forms allow-presentation"
          referrerPolicy="no-referrer"
          className="h-full w-full border-0"
          title="External content"
        />
      )
    case 'text':
      return (
        <div
          className="flex h-full w-full flex-col items-center justify-center p-12 text-center"
          style={{
            background: item.background ?? '#0F172A',
            color: item.color ?? '#FFFFFF',
          }}
        >
          <h1 className="text-6xl font-semibold tracking-tight">
            {item.heading}
          </h1>
          {item.subheading ? (
            <p className="mt-6 max-w-3xl text-2xl opacity-80">
              {item.subheading}
            </p>
          ) : null}
        </div>
      )
  }
}

function Emergency({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-red-700 p-12 text-center text-white">
      <p className="text-2xl font-semibold uppercase tracking-[0.4em] opacity-80">
        Notice
      </p>
      <h1 className="mt-8 max-w-5xl text-6xl font-bold leading-tight">
        {message}
      </h1>
    </div>
  )
}

function StandbyScreen({ nickname }: { nickname: string }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black text-white">
      <p className="text-sm uppercase tracking-[0.4em] text-white/40">
        HotelOps Signage
      </p>
      <h1 className="mt-4 text-3xl font-medium text-white/60">
        {nickname}
      </h1>
      <p className="mt-6 max-w-md text-center text-sm text-white/40">
        Waiting for a playlist. Assign one from the operator dashboard.
      </p>
    </div>
  )
}
