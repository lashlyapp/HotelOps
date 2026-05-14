'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Profile } from '@/lib/supabase/types'
import { updateProfileAction, type ActionResult } from '../actions'

const initial: ActionResult = {}

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(updateProfileAction, initial)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    // Don't reset on success — keep what the user typed so they see the
    // saved state. The values they entered are now the canonical state.
  }, [state.success])

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="full_name">Full name</Label>
          <Input
            id="full_name"
            name="full_name"
            type="text"
            defaultValue={profile.full_name ?? ''}
            autoComplete="name"
            placeholder="Maria Lopez"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="title">Job title</Label>
          <Input
            id="title"
            name="title"
            type="text"
            defaultValue={profile.title ?? ''}
            maxLength={120}
            placeholder="General Manager"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={profile.phone ?? ''}
          maxLength={40}
          autoComplete="tel"
          placeholder="+1 555 123 4567"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bio">Bio</Label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={600}
          defaultValue={profile.bio ?? ''}
          className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg shadow-xs focus-ring"
          placeholder="A short description your team will see on your profile."
        />
        <p className="text-xs text-subtle">Up to 600 characters.</p>
      </div>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save profile'}
      </Button>
    </form>
  )
}
