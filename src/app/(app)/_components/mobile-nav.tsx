'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'

/**
 * Mobile-only top bar with a hamburger that toggles a slide-in drawer
 * containing the full sidebar. Hidden on >=md where the static sidebar
 * is already visible. The drawer auto-closes on route change so picking
 * a nav link feels right.
 */
export function MobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  // Close the drawer whenever the route changes. Adjusting state during
  // render (rather than in an effect) is the React-recommended pattern
  // for derived state and avoids react-hooks/set-state-in-effect.
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    // Lock background scroll while the drawer is open.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  return (
    <>
      <header className="md:hidden flex items-center justify-between gap-3 border-b border-border-subtle bg-surface px-4 h-14">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="focus-ring -ml-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-fg hover:bg-surface-muted"
        >
          <HamburgerIcon />
        </button>
        <Wordmark size="sm" href="/dashboard" />
        <span className="w-10" aria-hidden />
      </header>

      {open ? (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] flex flex-col bg-surface-muted border-r border-border-subtle shadow-xl">
            <div className="flex justify-end px-2 py-2 border-b border-border-subtle">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md text-fg hover:bg-surface"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="flex-1 flex flex-col min-h-0 overflow-auto">
              {children}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )
}

function HamburgerIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  )
}

