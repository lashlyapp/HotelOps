'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[app/error]', error)
  }, [error])

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Something went wrong
        </h1>
        <p className="text-sm text-muted leading-relaxed">
          An unexpected error broke this page. The team has been notified — you
          can try again, or head back to the dashboard.
        </p>
        {error.digest ? (
          <p className="text-xs text-subtle font-mono">ref {error.digest}</p>
        ) : null}
        <div className="flex justify-center gap-2 pt-2">
          <Button type="button" onClick={() => unstable_retry()}>
            Try again
          </Button>
          <Link
            href="/dashboard"
            className="focus-ring inline-flex items-center justify-center rounded-md border border-border-default px-4 h-11 sm:h-9 text-sm font-medium text-fg hover:bg-surface-muted"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
