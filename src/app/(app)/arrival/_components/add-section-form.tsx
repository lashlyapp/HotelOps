'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ArrivalSectionKind } from '@/lib/supabase/types'
import { createSectionAction, type ActionResult } from '../actions'
import {
  SECTION_KINDS,
  SECTION_KIND_DESCRIPTION,
  SECTION_KIND_LABELS,
} from '../_lib/labels'

export function AddSectionForm({ pageId }: { pageId: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    createSectionAction,
    {},
  )
  const [kind, setKind] = useState<ArrivalSectionKind>('info')

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="page_id" value={pageId} />
      <div className="space-y-1.5">
        <Label htmlFor="kind">Type</Label>
        <select
          id="kind"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as ArrivalSectionKind)}
          className="focus-ring h-10 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg"
        >
          {SECTION_KINDS.map((k) => (
            <option key={k} value={k}>
              {SECTION_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          placeholder={
            kind === 'menu'
              ? 'Restaurant menu'
              : kind === 'event'
                ? 'Things to do nearby'
                : kind === 'marketing'
                  ? 'Specials'
                  : 'Breakfast'
          }
          maxLength={120}
          required
        />
      </div>
      <p className="sm:col-span-3 text-xs text-subtle">
        {SECTION_KIND_DESCRIPTION[kind]}
      </p>
      {state.error ? (
        <p className="sm:col-span-3 text-sm text-danger-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="sm:col-span-3 text-sm text-success-fg">
          {state.success}
        </p>
      ) : null}
      <div className="sm:col-span-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Adding…' : 'Add section'}
        </Button>
      </div>
    </form>
  )
}
