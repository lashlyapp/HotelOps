'use client'

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export function Disclosure({
  buttonLabel,
  openLabel,
  children,
}: {
  buttonLabel: string
  openLabel?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant={open ? 'ghost' : 'primary'}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (openLabel ?? 'Cancel') : buttonLabel}
      </Button>
      {open ? <div>{children}</div> : null}
    </div>
  )
}
