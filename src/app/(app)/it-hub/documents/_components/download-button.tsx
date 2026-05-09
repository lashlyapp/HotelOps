'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { presignDocumentDownloadAction } from '../actions'

export function DownloadButton({ id }: { id: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setPending(true)
    setError(null)
    const res = await presignDocumentDownloadAction({ id })
    setPending(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    // Same-tab navigation triggers the browser's download flow because the
    // presigned URL forces a Content-Disposition: attachment header.
    window.location.href = res.url
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleClick}
        disabled={pending}
      >
        {pending ? 'Preparing…' : 'Download'}
      </Button>
      {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
    </div>
  )
}
