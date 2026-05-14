'use client'

import { useEffect } from 'react'
import Link from 'next/link'

// `global-error` catches errors thrown in the root layout — places
// `error.tsx` can't reach. It replaces the root layout when active, so
// it must render its own <html> and <body> and cannot depend on the
// app's global stylesheet (which is imported by the root layout).
// Intentionally minimal styling via inline styles so a broken build
// doesn't take this fallback down with it.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[global-error]', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: '#fafaf9',
          color: '#0c0a09',
          padding: '1rem',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#57534e', margin: '0 0 1rem', lineHeight: 1.5 }}>
            The app hit an unexpected error and couldn’t recover.
          </p>
          {error.digest ? (
            <p
              style={{
                fontSize: '0.75rem',
                color: '#a8a29e',
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
              }}
            >
              ref {error.digest}
            </p>
          ) : null}
          <Link
            href="/"
            style={{
              display: 'inline-block',
              marginTop: '0.75rem',
              padding: '0.625rem 1rem',
              background: '#09090b',
              color: '#fafaf9',
              borderRadius: '0.375rem',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Back home
          </Link>
        </div>
      </body>
    </html>
  )
}
