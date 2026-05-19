'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { saveMarketPreferencesAction, type ActionResult } from '../../actions'

const initial: ActionResult = {}

export function PreferencesForm({
  peerAdrOptIn,
  marketBriefingEmailOptOut,
}: {
  peerAdrOptIn: boolean
  marketBriefingEmailOptOut: boolean
}) {
  const [state, action, pending] = useActionState(saveMarketPreferencesAction, initial)
  return (
    <form action={action} className="space-y-4">
      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border-default bg-surface p-3">
        <input
          type="checkbox"
          name="peer_adr_opt_in"
          defaultChecked={peerAdrOptIn}
          className="mt-1 accent-fg"
        />
        <div>
          <span className="block text-sm font-medium text-fg">
            Contribute to the city peer benchmark
          </span>
          <span className="block text-xs text-muted">
            Your ADR band is hashed and pooled with other boutiques in your
            city. You get a peer benchmark in return — only visible when ≥3
            properties have opted in so no individual property is identifiable.
          </span>
        </div>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border-default bg-surface p-3">
        <input
          type="checkbox"
          name="market_briefing_email_opt_out"
          defaultChecked={marketBriefingEmailOptOut}
          className="mt-1 accent-fg"
        />
        <div>
          <span className="block text-sm font-medium text-fg">
            Silence the daily morning email
          </span>
          <span className="block text-xs text-muted">
            We send the day&apos;s briefing to the org owner at 6am local by
            default. Check this to stop receiving it.
          </span>
        </div>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? 'Saving…' : 'Save preferences'}
        </Button>
        {state.error ? <p className="text-sm text-danger-fg">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-muted">{state.success}</p> : null}
      </div>
    </form>
  )
}
