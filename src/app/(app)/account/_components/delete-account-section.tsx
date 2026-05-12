'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteMyAccountAction } from '../actions'

type Role = 'org_owner' | 'org_staff'

export function DeleteAccountSection({
  role,
  orgName,
  orgSlug,
}: {
  role: Role
  orgName: string
  orgSlug: string
}) {
  const [expanded, setExpanded] = useState(false)

  const expected = role === 'org_owner' ? orgSlug : 'DELETE'
  const heading =
    role === 'org_owner'
      ? `Delete ${orgName} and your account`
      : 'Delete your account'
  const blurb =
    role === 'org_owner' ? (
      <>
        This permanently removes <strong>{orgName}</strong>, every property,
        every event, every uploaded file, every team member, and your
        Stripe subscription. Your team members will lose access immediately.
        This action is irreversible.
      </>
    ) : (
      <>
        This permanently removes your account and detaches you from{' '}
        <strong>{orgName}</strong>. Your hotel and its data are unaffected.
        This action is irreversible.
      </>
    )

  if (!expanded) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setExpanded(true)}
        className="text-danger-fg hover:bg-danger-bg"
      >
        {role === 'org_owner' ? 'Delete organization and account…' : 'Delete account…'}
      </Button>
    )
  }

  return (
    <form
      action={deleteMyAccountAction}
      onSubmit={(e) => {
        const ok = confirm(
          role === 'org_owner'
            ? `Really delete ${orgName} and every person, file, and event in it? This cannot be undone.`
            : 'Really delete your account? This cannot be undone.',
        )
        if (!ok) e.preventDefault()
      }}
      className="space-y-3 rounded-md border border-danger-default bg-danger-bg/40 p-4"
    >
      <p className="text-sm text-danger-fg font-semibold">{heading}</p>
      <p className="text-sm text-fg leading-relaxed">{blurb}</p>
      <div className="space-y-1.5">
        <Label htmlFor="confirmation">
          Type{' '}
          <code className="font-mono text-xs bg-surface-muted px-1 py-0.5 rounded">
            {expected}
          </code>{' '}
          to confirm
        </Label>
        <Input
          id="confirmation"
          name="confirmation"
          type="text"
          autoComplete="off"
          required
          pattern={escapeForPattern(expected)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" className="bg-danger-default hover:brightness-95">
          {role === 'org_owner' ? 'Delete organization' : 'Delete account'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setExpanded(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

function escapeForPattern(s: string): string {
  // Anchor the pattern to the exact expected value (case-sensitive).
  return `^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
}
