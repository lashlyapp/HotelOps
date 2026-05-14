'use client'

import Link from 'next/link'
import { useEffect } from 'react'

// Route-scoped error boundary. Catches runtime errors raised by /arrival
// and its children so a single misshapen JSONB row doesn't take the user
// to the bare global-error page. The message is intentionally generic;
// the digest is the Vercel runtime error reference the operator can quote
// to support.
export default function ArrivalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[arrival] route error', error)
  }, [error])

  return (
    <div className="p-4 sm:p-8 max-w-xl">
      <div className="rounded-md border border-border-subtle bg-surface p-5 space-y-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-subtle">
            Arrival
          </p>
          <h2 className="mt-1 text-base font-semibold text-fg">
            Something went wrong loading this page
          </h2>
          <p className="mt-1 text-sm text-muted">
            Try again — if it keeps happening, send us the reference below.
          </p>
        </div>
        {error.digest ? (
          <p className="font-mono text-xs text-subtle">
            ref {error.digest}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            onClick={() => reset()}
            className="focus-ring inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-fg hover:bg-primary-hover"
          >
            Try again
          </button>
          <Link
            href="/arrival"
            className="focus-ring inline-flex h-9 items-center rounded-md border border-border-default px-3 text-sm font-medium text-fg hover:bg-surface-muted"
          >
            Back to arrival
          </Link>
        </div>
      </div>
    </div>
  )
}
