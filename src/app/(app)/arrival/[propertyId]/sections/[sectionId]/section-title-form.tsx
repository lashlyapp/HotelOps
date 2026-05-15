'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  updateSectionTitleAction,
  type ActionResult,
} from '../../../actions'

export function SectionTitleForm({
  id,
  title,
  isPublished,
}: {
  id: string
  title: string
  isPublished: boolean
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    updateSectionTitleAction,
    {},
  )
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={title}
          required
          maxLength={120}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          name="is_published"
          defaultChecked={isPublished}
        />
        Show on the public arrival page
      </label>
      {state.error ? (
        <p className="text-xs text-danger-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-xs text-success-fg">{state.success}</p>
      ) : null}
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  )
}
