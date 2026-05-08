'use client'

import { useActionState, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import {
  removePropertyLogoAction,
  uploadPropertyLogoAction,
  type ActionResult,
} from '@/lib/admin/actions'

const initial: ActionResult = {}

const NEXT_PUBLIC_R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL

function publicUrl(key: string): string {
  const base = (NEXT_PUBLIC_R2_PUBLIC_URL ?? '').replace(/\/+$/, '')
  const encoded = key
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')
  return `${base}/${encoded}`
}

export function LogoSection({
  propertyId,
  propertyName,
  logoKey,
  logoUploadedAt,
}: {
  propertyId: string
  propertyName: string
  logoKey: string | null
  logoUploadedAt: string | null
}) {
  const [state, action, pending] = useActionState(
    uploadPropertyLogoAction,
    initial,
  )
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const cacheBust = logoUploadedAt
    ? `?t=${new Date(logoUploadedAt).getTime()}`
    : ''
  const currentUrl = logoKey ? `${publicUrl(logoKey)}${cacheBust}` : null
  const displayUrl = previewUrl ?? currentUrl

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const reader = new FileReader()
    reader.onload = () => setPreviewUrl(String(reader.result))
    reader.readAsDataURL(file)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="size-20 shrink-0 rounded-md overflow-hidden border border-border-subtle bg-surface-muted">
            {displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayUrl}
                alt={`${propertyName} logo`}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-2xl font-semibold text-muted">
                {propertyName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1 text-sm text-muted">
            <p>
              Square images look best. PNG, JPEG, WebP, or SVG, up to 5 MB.
            </p>
          </div>
        </div>

        <form action={action} className="space-y-3">
          <input type="hidden" name="property_id" value={propertyId} />
          <input
            ref={fileInputRef}
            id="logo-upload"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleFileChange}
            className="block w-full text-sm text-muted file:mr-4 file:rounded-md file:border-0 file:bg-surface-muted file:px-4 file:py-2 file:text-sm file:font-medium file:text-fg hover:file:bg-surface"
          />

          {state.error ? (
            <p className="text-sm text-danger-fg">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-success-fg">{state.success}</p>
          ) : null}

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Uploading...' : currentUrl ? 'Replace' : 'Upload'}
            </Button>
            {currentUrl ? <RemoveButton propertyId={propertyId} /> : null}
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

function RemoveButton({ propertyId }: { propertyId: string }) {
  return (
    <form
      action={removePropertyLogoAction}
      onSubmit={(e) => {
        if (!confirm('Remove the current logo?')) e.preventDefault()
      }}
    >
      <input type="hidden" name="property_id" value={propertyId} />
      <Button type="submit" variant="ghost" size="sm">
        Remove
      </Button>
    </form>
  )
}
