'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'

type Endpoint = '/api/stripe/setup-checkout' | '/api/stripe/portal'

export function StripeRedirectButton({
  endpoint,
  children,
  variant = 'primary',
  size = 'md',
}: {
  endpoint: Endpoint
  children: React.ReactNode
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const onClick = () => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(endpoint, { method: 'POST' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setError(body.error ?? `Request failed (${res.status})`)
          return
        }
        const { url } = (await res.json()) as { url?: string }
        if (!url) {
          setError('No redirect URL returned.')
          return
        }
        window.location.href = url
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error')
      }
    })
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={onClick}
        disabled={isPending}
      >
        {isPending ? 'Redirecting…' : children}
      </Button>
      {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
    </div>
  )
}
