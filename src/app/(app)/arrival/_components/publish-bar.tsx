'use client'

import { useActionState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ArrivalPage } from '@/lib/supabase/types'
import { publishPageAction, type ActionResult } from '../actions'

/**
 * Status badge + publish/republish button for the arrival builder.
 *
 * `canPublish` reflects whether the org has the Guest Experience add-on
 * on. When false, the Publish button is replaced upstream by the
 * <UpgradePrompt> on the builder page — but we still render the bar so
 * the operator sees their draft status and last-published timestamp.
 */
export function PublishBar({
  page,
  canPublish,
}: {
  page: ArrivalPage
  canPublish: boolean
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    publishPageAction,
    {},
  )
  const isPublished = !!page.published_at
  const isStale =
    isPublished && new Date(page.updated_at) > new Date(page.published_at!)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle bg-surface-muted px-4 py-3">
      <div className="flex items-center gap-2 text-sm">
        {isPublished ? (
          <Badge tone={isStale ? 'warning' : 'success'}>
            {isStale ? 'Unpublished changes' : 'Published'}
          </Badge>
        ) : (
          <Badge tone="neutral">Draft</Badge>
        )}
        <span className="text-xs text-muted">
          {isPublished
            ? `Last published ${new Date(page.published_at!).toLocaleString()}`
            : 'Not yet published'}
        </span>
      </div>
      {canPublish ? (
        <form action={action}>
          <input type="hidden" name="page_id" value={page.id} />
          <Button type="submit" size="sm" disabled={pending}>
            {pending
              ? 'Publishing…'
              : isStale || !isPublished
                ? 'Publish'
                : 'Republish'}
          </Button>
        </form>
      ) : (
        <span className="text-xs text-subtle">
          Publishing requires the Guest Experience add-on (see below).
        </span>
      )}
      {state.error ? (
        <p className="text-xs text-danger-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-xs text-success-fg">{state.success}</p>
      ) : null}
    </div>
  )
}
