'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

/**
 * Compact "…" overflow menu for the actions column of a property row in
 * /billing. Today its sole item is "Manage add-ons", but it's modeled as
 * a menu so future per-row actions (e.g. "Pause subscription", "Move to
 * different card", "Download W-9") land in the same place instead of
 * crowding the row with buttons.
 *
 * Closes on outside click, escape, and route change. Uses position:fixed
 * for the panel so it escapes the table's overflow-x-auto wrapper.
 */
export function RowActionsMenu({ propertyId }: { propertyId: string }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  )

  useEffect(() => {
    if (!open) return
    function place() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setCoords({
        top: rect.bottom + 6,
        right: Math.max(8, window.innerWidth - rect.right),
      })
    }
    place()
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node | null
      if (!t) return
      if (panelRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEscape)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-fg"
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className="h-4 w-4"
          fill="currentColor"
        >
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
        <span className="sr-only">More actions</span>
      </button>
      {open && coords ? (
        <div
          ref={panelRef}
          role="menu"
          className="fixed z-[50] w-48 rounded-md border border-border-default bg-surface shadow-lg"
          style={{ top: coords.top, right: coords.right }}
        >
          <Link
            href={`/billing/${propertyId}/addons`}
            role="menuitem"
            className="focus-ring block px-3 py-2 text-sm text-fg hover:bg-surface-muted"
            onClick={() => setOpen(false)}
          >
            Manage add-ons
          </Link>
        </div>
      ) : null}
    </>
  )
}
