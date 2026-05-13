'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ResetPreview, ResetSummary } from '@/lib/billing/reset-tenant'
import {
  previewResetTenantBillingAction,
  resetTenantBillingAction,
} from '@/lib/admin/actions'

/**
 * Two-step destructive UI for resetting a tenant's billing state.
 *
 *   Step 1 — Preview: a button kicks off a Stripe + DB walk and shows
 *            exact counts ("3 subscriptions, 2 open invoices, 5 DB
 *            rows"). No writes. Safe to click multiple times.
 *   Step 2 — Confirm: the operator types the org slug to enable the
 *            destructive button. An optional checkbox toggles `hard`
 *            mode (also deletes the Stripe Customer and saved cards).
 *
 * Sits in the admin tenant page's "Danger zone" alongside Delete
 * tenant. Platform-admin only via server-action auth.
 */
export function ResetBillingSection({
  orgId,
  orgSlug,
  orgName,
}: {
  orgId: string
  orgSlug: string
  orgName: string
}) {
  const [preview, setPreview] = useState<ResetPreview | null>(null)
  const [summary, setSummary] = useState<ResetSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [hard, setHard] = useState(false)
  const [pending, startTransition] = useTransition()

  const slugMatches = confirmation === orgSlug

  function loadPreview() {
    setError(null)
    setSummary(null)
    const fd = new FormData()
    fd.set('org_id', orgId)
    startTransition(async () => {
      const res = await previewResetTenantBillingAction({}, fd)
      if (res.error) setError(res.error)
      if (res.preview) setPreview(res.preview)
    })
  }

  function runReset() {
    setError(null)
    const fd = new FormData()
    fd.set('org_id', orgId)
    fd.set('confirmation', confirmation)
    fd.set('expected_confirmation', orgSlug)
    if (hard) fd.set('hard', 'on')
    startTransition(async () => {
      const res = await resetTenantBillingAction({}, fd)
      if (res.error) {
        setError(res.error)
        return
      }
      if (res.summary) {
        setSummary(res.summary)
        // Clear the preview so the operator can re-preview if they
        // want to verify the post-reset state.
        setPreview(null)
        setConfirmation('')
      }
    })
  }

  return (
    <Card className="border-warning-fg/30">
      <CardHeader>
        <CardTitle className="text-warning-fg">Reset billing</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-muted leading-relaxed">
          Cancel every Stripe subscription for{' '}
          <strong className="text-fg">{orgName}</strong>, void open
          invoices, and clear billing rows so they can re-onboard cleanly
          under per-property billing. Properties, members, and R2 files
          are <strong className="text-fg">not</strong> touched.
        </p>

        {preview === null && summary === null ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={loadPreview}
            disabled={pending}
          >
            {pending ? 'Loading preview…' : 'Preview reset'}
          </Button>
        ) : null}

        {preview ? (
          <div className="space-y-4">
            <PreviewBlock preview={preview} />

            {preview.hasWorkToDo ? (
              <div className="space-y-3 border-t border-border-subtle pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-confirmation">
                    Type{' '}
                    <code className="rounded-xs bg-surface-muted px-1 py-0.5 text-xs font-mono">
                      {orgSlug}
                    </code>{' '}
                    to confirm
                  </Label>
                  <Input
                    id="reset-confirmation"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    autoComplete="off"
                  />
                </div>

                <label className="flex items-start gap-2 text-sm text-fg cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 rounded-xs border border-border-default bg-surface accent-fg focus-ring"
                    checked={hard}
                    onChange={(e) => setHard(e.target.checked)}
                  />
                  <span>
                    <strong>Hard reset</strong> — also delete the Stripe
                    Customer (wipes saved cards, billing address, tax id).
                    Leave unchecked to preserve them so resubscribe is
                    one-click.
                  </span>
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={runReset}
                    disabled={!slugMatches || pending}
                    className="focus-ring inline-flex h-9 items-center justify-center rounded-md bg-danger-bg px-4 text-sm font-medium text-danger-fg hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 transition"
                  >
                    {pending ? 'Resetting…' : 'Reset billing'}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={() => {
                      setPreview(null)
                      setConfirmation('')
                      setHard(false)
                    }}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-t border-border-subtle pt-4">
                <p className="text-sm text-success-fg">
                  Nothing to reset — this tenant is already clean.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreview(null)}
                >
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {summary ? (
          <div className="rounded-md border border-success-fg/30 bg-success-bg p-3 text-sm text-success-fg space-y-1">
            <p className="font-medium">Reset complete.</p>
            <ul className="list-disc pl-5">
              <li>Subscriptions cancelled: {summary.subscriptionsCancelled}</li>
              <li>Invoices voided/deleted: {summary.invoicesVoided}</li>
              <li>DB rows cleared: {summary.dbRowsDeleted}</li>
              {summary.customersDeleted > 0 ? (
                <li>Stripe Customers deleted: {summary.customersDeleted}</li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-danger-fg" role="status">
            {error}
          </p>
        ) : null}
      </CardBody>
    </Card>
  )
}

function PreviewBlock({ preview }: { preview: ResetPreview }) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-muted p-3 text-sm space-y-3">
      <p className="font-medium text-fg">This reset will:</p>
      <Row
        label="Cancel Stripe subscriptions"
        count={preview.subscriptionsToCancel.length}
      />
      {preview.subscriptionsToCancel.length > 0 ? (
        <ul className="pl-5 space-y-0.5 text-xs text-muted font-mono">
          {preview.subscriptionsToCancel.map((s) => (
            <li key={s.id}>
              {s.id} · {s.status}
              {s.quantity != null ? ` · qty=${s.quantity}` : ''}
            </li>
          ))}
        </ul>
      ) : null}

      <Row
        label="Void/delete open invoices"
        count={preview.invoicesToVoid.length}
      />
      {preview.invoicesToVoid.length > 0 ? (
        <ul className="pl-5 space-y-0.5 text-xs text-muted font-mono">
          {preview.invoicesToVoid.map((i) => (
            <li key={i.id}>
              {i.id} · {i.status} · {formatMoney(i.amount_due_cents, i.currency)}
            </li>
          ))}
        </ul>
      ) : null}

      <Row label="Delete DB billing rows" count={preview.dbRowsToDelete} />

      {preview.customerIds.length > 0 ? (
        <p className="text-xs text-muted">
          Stripe Customer(s) preserved:{' '}
          <span className="font-mono">{preview.customerIds.join(', ')}</span>
          {' — '}saved cards survive unless &ldquo;Hard reset&rdquo; is checked.
        </p>
      ) : null}
    </div>
  )
}

function Row({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-fg">{label}</span>
      <span
        className={`tabular-nums font-medium ${
          count > 0 ? 'text-fg' : 'text-subtle'
        }`}
      >
        {count}
      </span>
    </div>
  )
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (currency || 'USD').toUpperCase(),
  }).format(cents / 100)
}
