'use client'

import { useState } from 'react'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteTenantAction } from '@/lib/admin/actions'

export function DeleteTenantSection({
  orgId,
  orgSlug,
}: {
  orgId: string
  orgSlug: string
}) {
  const [confirmation, setConfirmation] = useState('')
  const matches = confirmation === orgSlug

  return (
    <Card className="border-danger-fg/30">
      <CardHeader>
        <CardTitle className="text-danger-fg">Danger zone</CardTitle>
      </CardHeader>
      <CardBody>
        <form action={deleteTenantAction} className="space-y-3">
          <input type="hidden" name="org_id" value={orgId} />
          <input type="hidden" name="expected_confirmation" value={orgSlug} />

          <p className="text-sm text-muted">
            Deleting this tenant removes the organization, its properties, and
            its invoices. Members&apos; user accounts are kept (you may need to
            delete them in Supabase Auth manually). Files in R2 are{' '}
            <strong className="text-fg">not</strong> deleted.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="confirmation">
              Type{' '}
              <code className="rounded-xs bg-surface-muted px-1 py-0.5 text-xs font-mono">
                {orgSlug}
              </code>{' '}
              to confirm
            </Label>
            <Input
              id="confirmation"
              name="confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
            disabled={!matches}
            className="focus-ring inline-flex h-9 items-center justify-center rounded-md bg-danger-bg px-4 text-sm font-medium text-danger-fg hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 transition"
          >
            Delete tenant
          </button>
        </form>
      </CardBody>
    </Card>
  )
}
