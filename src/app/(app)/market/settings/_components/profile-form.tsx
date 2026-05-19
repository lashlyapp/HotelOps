'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { MarketSegment } from '@/lib/supabase/types'
import {
  saveMarketProfileAction,
  type ActionResult,
} from '../../actions'

const initial: ActionResult = {}

const SEGMENTS: { value: MarketSegment; label: string; hint: string }[] = [
  { value: 'boutique', label: 'Boutique', hint: 'Independent, design-led, 20–150 rooms.' },
  { value: 'lifestyle', label: 'Lifestyle', hint: 'Brand-forward, social, urban.' },
  { value: 'upscale', label: 'Upscale', hint: 'Higher-tier service, full amenity.' },
  { value: 'luxury', label: 'Luxury', hint: 'Top of market, premium ADR.' },
  { value: 'midscale', label: 'Midscale', hint: 'Mid-tier service and rate.' },
  { value: 'economy', label: 'Economy', hint: 'Budget-tier.' },
]

export type ProfileFormProps = {
  propertyId: string
  initial: {
    market_segment: MarketSegment
    tier: number
    adr_floor: number | null
    adr_ceiling: number | null
    location_descriptor: string | null
    amenity_tags: string | null
    tripadvisor_url: string | null
  }
  currencyCode: string
}

export function ProfileForm({
  propertyId,
  initial: init,
  currencyCode,
}: ProfileFormProps) {
  const [state, action, pending] = useActionState(
    saveMarketProfileAction,
    initial,
  )

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="property_id" value={propertyId} />

      <div className="space-y-2">
        <Label>Market segment</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SEGMENTS.map((s) => (
            <label
              key={s.value}
              className="focus-ring flex cursor-pointer items-start gap-2 rounded-md border border-border-default bg-surface p-3 has-[:checked]:border-fg has-[:checked]:bg-surface-muted"
            >
              <input
                type="radio"
                name="market_segment"
                value={s.value}
                defaultChecked={init.market_segment === s.value}
                className="mt-0.5 accent-fg"
              />
              <span>
                <span className="block text-sm font-medium text-fg">
                  {s.label}
                </span>
                <span className="block text-xs text-muted">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="tier">Tier (1–5)</Label>
          <Input
            id="tier"
            name="tier"
            type="number"
            min={1}
            max={5}
            defaultValue={init.tier}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="adr_floor">ADR floor ({currencyCode})</Label>
          <Input
            id="adr_floor"
            name="adr_floor"
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            defaultValue={init.adr_floor ?? ''}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="adr_ceiling">ADR ceiling ({currencyCode})</Label>
          <Input
            id="adr_ceiling"
            name="adr_ceiling"
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            defaultValue={init.adr_ceiling ?? ''}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="location_descriptor">Location descriptor</Label>
        <Input
          id="location_descriptor"
          name="location_descriptor"
          placeholder="Downtown waterfront, Historic quarter, …"
          defaultValue={init.location_descriptor ?? ''}
        />
        <p className="text-xs text-subtle">
          Appears in briefing copy and competitor matching.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="amenity_tags">Amenity tags</Label>
        <Input
          id="amenity_tags"
          name="amenity_tags"
          placeholder="rooftop_bar, spa, pool"
          defaultValue={init.amenity_tags ?? ''}
        />
        <p className="text-xs text-subtle">
          Comma-separated. Used to refine competitor archetypes.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="tripadvisor_url">TripAdvisor URL</Label>
        <Input
          id="tripadvisor_url"
          name="tripadvisor_url"
          type="url"
          placeholder="https://www.tripadvisor.com/Hotel_Review-…"
          defaultValue={init.tripadvisor_url ?? ''}
        />
        <p className="text-xs text-subtle">
          Optional. Adding this turns on review intelligence — sentiment trend, top
          complaint/praise themes, and comp-set comparison. We read your TripAdvisor
          page once a day; nothing is published.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save and re-derive insights'}
        </Button>
        {state.error ? (
          <p className="text-sm text-danger-fg">{state.error}</p>
        ) : null}
        {state.success ? (
          <p className="text-sm text-muted">{state.success}</p>
        ) : null}
      </div>
    </form>
  )
}
