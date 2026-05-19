'use client'

import { useActionState } from 'react'
import { toggleDataSourceAction, type ActionResult } from '../actions'

const initial: ActionResult = {}

export function ToggleForm({
  source,
  enabled,
}: {
  source: string
  enabled: boolean
}) {
  const [state, action, pending] = useActionState(toggleDataSourceAction, initial)
  return (
    <form action={action} className="inline-flex items-center">
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
      <button
        type="submit"
        disabled={pending}
        title={state.error ?? state.success ?? ''}
        className={`focus-ring inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors ${
          enabled ? 'bg-success-fg' : 'bg-border-default'
        } ${pending ? 'opacity-60' : ''}`}
        aria-pressed={enabled}
        aria-label={enabled ? 'Disable source' : 'Enable source'}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-surface shadow transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </form>
  )
}
