'use client'

import { useActionState, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { EnrolledFactor } from '@/lib/auth/mfa'
import {
  confirmMfaEnrollmentAction,
  startMfaEnrollmentAction,
  unenrollMfaAction,
  type ActionResult,
  type StartMfaEnrollmentResult,
} from '../actions'

const startInitial: StartMfaEnrollmentResult = {}
const confirmInitial: ActionResult = {}
const unenrollInitial: ActionResult = {}

/**
 * Two-factor authentication section on /account.
 *
 * Three rendering modes:
 *  1. No verified factor + not enrolling → "Enable" button.
 *  2. Enrollment in progress (server has returned a QR / secret) →
 *     QR + code input + confirm button.
 *  3. Verified factor exists → list with an unenroll button.
 *
 * Server actions do the work; this component is just state plumbing.
 */
export function MfaSection({
  factors,
}: {
  factors: EnrolledFactor[]
}) {
  const [startState, startAction, startPending] = useActionState(
    startMfaEnrollmentAction,
    startInitial,
  )
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmMfaEnrollmentAction,
    confirmInitial,
  )
  // Track whether the user has clicked "Cancel" on an in-flight
  // enrollment — gives them a way out without leaving the page.
  const [cancelled, setCancelled] = useState(false)

  const enrollment =
    !cancelled && startState.factorId && startState.qrPngDataUri && startState.secret
      ? {
          factorId: startState.factorId,
          qrPngDataUri: startState.qrPngDataUri,
          secret: startState.secret,
        }
      : null

  // If we just confirmed (success message present) the server already
  // revalidated /account, so `factors` will include the new one on the
  // next render. Treat any verified factor in the prop as "enrolled".
  const hasFactor = factors.length > 0 && !confirmState.error

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-fg">
            Two-factor authentication
          </p>
          <p className="mt-1 text-xs text-muted leading-relaxed">
            Optional. Pair an authenticator app (1Password, Authy, Google
            Authenticator) — we’ll ask for a 6-digit code on every sign-in
            after your password.
          </p>
        </div>
        {hasFactor ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off</Badge>}
      </div>

      {hasFactor ? (
        <FactorList factors={factors} />
      ) : enrollment ? (
        <EnrollmentPanel
          factorId={enrollment.factorId}
          qrPngDataUri={enrollment.qrPngDataUri}
          secret={enrollment.secret}
          confirmAction={confirmAction}
          confirmPending={confirmPending}
          confirmError={confirmState.error}
          onCancel={() => setCancelled(true)}
        />
      ) : (
        <form action={startAction}>
          {startState.error ? (
            <p className="mb-2 text-sm text-danger-fg">{startState.error}</p>
          ) : null}
          <Button type="submit" size="sm" disabled={startPending}>
            {startPending ? 'Setting up…' : 'Enable two-factor authentication'}
          </Button>
        </form>
      )}

      {confirmState.success ? (
        <p className="text-sm text-success-fg">{confirmState.success}</p>
      ) : null}
    </div>
  )
}

function EnrollmentPanel({
  factorId,
  qrPngDataUri,
  secret,
  confirmAction,
  confirmPending,
  confirmError,
  onCancel,
}: {
  factorId: string
  qrPngDataUri: string
  secret: string
  confirmAction: (formData: FormData) => void
  confirmPending: boolean
  confirmError: string | undefined
  onCancel: () => void
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-muted p-4 space-y-4">
      <ol className="space-y-3 text-sm text-fg">
        <li>
          <strong className="font-medium">1.</strong> Scan this QR code in your
          authenticator app:
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrPngDataUri}
            alt="Two-factor QR code"
            width={200}
            height={200}
            className="mt-2 rounded-md border border-border-subtle bg-surface p-2"
          />
        </li>
        <li>
          <strong className="font-medium">2.</strong> Or paste this secret
          manually:
          <code className="mt-1 block break-all rounded-md bg-surface px-2 py-1.5 text-xs font-mono text-fg">
            {secret}
          </code>
        </li>
        <li>
          <strong className="font-medium">3.</strong> Enter the 6-digit code
          your app generates:
        </li>
      </ol>

      <form action={confirmAction} className="space-y-3">
        <input type="hidden" name="factor_id" value={factorId} />
        <div className="space-y-1.5">
          <Label htmlFor="mfa-enroll-code" className="sr-only">
            Verification code
          </Label>
          <Input
            id="mfa-enroll-code"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            minLength={6}
            autoComplete="one-time-code"
            required
            autoFocus
            className="text-center text-xl tracking-[0.4em] font-mono"
          />
        </div>
        {confirmError ? (
          <p className="text-sm text-danger-fg">{confirmError}</p>
        ) : null}
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={confirmPending}>
            {confirmPending ? 'Verifying…' : 'Verify and turn on'}
          </Button>
          <button
            type="button"
            onClick={onCancel}
            className="focus-ring rounded-sm text-sm font-medium text-muted hover:text-fg"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function FactorList({ factors }: { factors: EnrolledFactor[] }) {
  // Track which factor (if any) the user has clicked "Remove" on so
  // we can swap that row for the password-confirm form. Only one
  // confirmation can be open at a time.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  return (
    <ul className="rounded-md border border-border-subtle divide-y divide-border-subtle">
      {factors.map((f) => (
        <li key={f.id} className="px-3 py-2.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-fg">
                {f.friendlyName ?? 'Authenticator app'}
              </p>
              <p className="text-xs text-subtle">
                Added{' '}
                {new Date(f.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
            {confirmingId !== f.id ? (
              <button
                type="button"
                onClick={() => setConfirmingId(f.id)}
                className="focus-ring rounded-sm text-xs font-medium text-danger-fg hover:underline"
              >
                Remove
              </button>
            ) : null}
          </div>
          {confirmingId === f.id ? (
            <UnenrollConfirmForm
              factorId={f.id}
              onCancel={() => setConfirmingId(null)}
            />
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/**
 * Inline password-confirm form rendered when the user clicks
 * "Remove" on a factor. Server action verifies the password against
 * a throwaway Supabase client (so the current aal2 session isn't
 * disturbed) before unenrolling.
 */
function UnenrollConfirmForm({
  factorId,
  onCancel,
}: {
  factorId: string
  onCancel: () => void
}) {
  const [state, action, pending] = useActionState(
    unenrollMfaAction,
    unenrollInitial,
  )
  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="factor_id" value={factorId} />
      <p className="text-xs text-muted leading-relaxed">
        Enter your current password to confirm. After this, sign-in will only
        require your password.
      </p>
      <Input
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        placeholder="Current password"
      />
      {state.error ? (
        <p className="text-xs text-danger-fg">{state.error}</p>
      ) : state.success ? (
        <p className="text-xs text-success-fg">{state.success}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          variant="danger"
          size="sm"
          disabled={pending}
        >
          {pending ? 'Removing…' : 'Confirm and remove'}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="focus-ring rounded-sm text-xs font-medium text-muted hover:text-fg disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
