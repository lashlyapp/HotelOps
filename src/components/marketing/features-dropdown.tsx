'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type Item = { href: string; label: string }

/**
 * Top-nav dropdown that consolidates the per-module deep links
 * (Work Orders, Signage, Arrival) plus an "All features" link into
 * one menu. Keeps the desktop nav from overflowing as we add more
 * modules. Opens on hover (desktop pointer affordance) and on click
 * (keyboard / touch). Closes on outside click, Escape, or
 * mouse-leave.
 */
export function FeaturesDropdown({
  label,
  items,
}: {
  label: string
  items: Item[]
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="focus-ring inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-muted hover:text-fg"
      >
        {label}
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M2 4l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div className="absolute left-0 top-full pt-1">
          <ul
            role="menu"
            className="min-w-[200px] rounded-md border border-border-subtle bg-surface py-1 shadow-lg"
          >
            {items.map((it) => (
              <li key={it.href} role="none">
                <Link
                  href={it.href}
                  role="menuitem"
                  className="focus-ring block px-4 py-2 text-sm text-muted hover:bg-surface-muted hover:text-fg"
                  onClick={() => setOpen(false)}
                >
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
