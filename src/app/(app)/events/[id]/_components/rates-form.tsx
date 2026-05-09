'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Event } from '@/lib/supabase/types'
import { updateRatesAction, type ActionResult } from '../../actions'

const initial: ActionResult = {}

export function RatesForm({ event }: { event: Event }) {
  const [state, action, pending] = useActionState(updateRatesAction, initial)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={event.id} />
      <p className="text-xs text-muted">
        Service charge applies to chargeable lines; tax applies to taxable lines
        and to the service charge on those lines.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="r-svc">Service charge %</Label>
          <Input
            id="r-svc"
            name="service_charge_pct"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={Number(event.service_charge_pct).toString()}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r-tax">Tax %</Label>
          <Input
            id="r-tax"
            name="tax_pct"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={Number(event.tax_pct).toString()}
          />
        </div>
      </div>

      {state.error ? (
        <p className="text-sm text-danger-fg">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving...' : 'Save rates'}
      </Button>
    </form>
  )
}
