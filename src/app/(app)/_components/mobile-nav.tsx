'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

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

  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const drawerRef = useRef<HTMLElement | null>(null)
  const firstFocusRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const trigger = triggerRef.current

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key !== 'Tab') return
      const drawer = drawerRef.current
      if (!drawer) return
      const focusable = drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || !drawer.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    // Lock background scroll while the drawer is open.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Move focus into the drawer (the close button) so screen readers
    // announce it and Tab cycles inside the trap.
    firstFocusRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      // Return focus to the hamburger that opened the drawer.
      trigger?.focus()
    }
  }, [open])

  return (
    <>
      <header className="md:hidden flex items-center justify-between gap-3 border-b border-border-subtle bg-surface px-4 h-14">
        <button
          ref={triggerRef}
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
          <aside
            ref={drawerRef}
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] flex flex-col bg-surface-muted border-r border-border-subtle shadow-xl"
          >
            <div className="flex justify-end px-2 py-2 border-b border-border-subtle">
              <button
                ref={firstFocusRef}
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

