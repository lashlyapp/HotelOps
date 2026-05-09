'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * Inline password / secret cell. Hidden by default; click to reveal or copy.
 * Stays small enough to drop into a list row without taking over the layout.
 */
export function Secret({
  value,
  className,
}: {
  value: string | null
  className?: string
}) {
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!value) return <span className="text-subtle">—</span>

  async function copy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API can fail in older browsers / insecure contexts.
    }
  }

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs font-mono text-fg">
        {shown ? value : '•'.repeat(Math.min(value.length, 10))}
      </code>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
      >
        {shown ? 'Hide' : 'Show'}
      </button>
      <button
        type="button"
        onClick={copy}
        className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </span>
  )
}
