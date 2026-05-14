'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ArrivalPage, ItNetwork } from '@/lib/supabase/types'
import { savePageAction, type ActionResult } from '../actions'

export function PageForm({
  propertyId,
  page,
  networks,
}: {
  propertyId: string
  page: ArrivalPage
  networks: ItNetwork[]
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    savePageAction,
    {},
  )
  const [entries, setEntries] = useState(() =>
    page.quick_info.length > 0
      ? page.quick_info
      : [{ label: '', value: '' }],
  )

  function addEntry() {
    if (entries.length >= 12) return
    setEntries((e) => [...e, { label: '', value: '' }])
  }
  function removeEntry(idx: number) {
    setEntries((e) => e.filter((_, i) => i !== idx))
  }

  const hiddenSet = new Set(page.hidden_network_ids)

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="property_id" value={propertyId} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="public_slug">Public URL slug</Label>
          <Input
            id="public_slug"
            name="public_slug"
            defaultValue={page.public_slug}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            required
          />
          <p className="text-[11px] text-subtle">
            Becomes /a/&lt;slug&gt;. Stick to lowercase, numbers, and hyphens.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand_color">Brand color</Label>
          <Input
            id="brand_color"
            name="brand_color"
            placeholder="#0F172A"
            defaultValue={page.brand_color ?? ''}
            pattern="#[0-9a-fA-F]{3,8}"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="welcome_heading">Welcome heading</Label>
        <Input
          id="welcome_heading"
          name="welcome_heading"
          maxLength={120}
          defaultValue={page.welcome_heading ?? ''}
          placeholder="Welcome to The Bayside"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="welcome_body">Welcome message</Label>
        <textarea
          id="welcome_body"
          name="welcome_body"
          rows={4}
          maxLength={2000}
          defaultValue={page.welcome_body ?? ''}
          placeholder="A few sentences for arriving guests. Supports **bold**, *italic*, [links](https://example.com), and - bulleted lists."
          className="focus-ring w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg"
        />
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-subtle">
          Wi-Fi
        </p>
        {networks.length === 0 ? (
          <p className="mt-1 text-sm text-muted">
            No shareable Wi-Fi networks yet. Add one in IT Hub → Wi-Fi and
            tick &quot;share with guests&quot;.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {networks.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-fg">
                  {n.label}
                  {n.ssid ? (
                    <span className="ml-2 text-xs text-muted">{n.ssid}</span>
                  ) : null}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input
                    type="checkbox"
                    name="hidden_network_id"
                    value={n.id}
                    defaultChecked={hiddenSet.has(n.id)}
                  />
                  Hide from arrival page
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-subtle">
          Quick info
        </p>
        <p className="mt-0.5 text-xs text-subtle">
          Short label / value pairs (checkout time, parking notes, contact
          phone…). Up to 12.
        </p>
        <ul className="mt-2 space-y-2">
          {entries.map((e, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <Input
                name="quick_info_label"
                defaultValue={e.label}
                placeholder="Checkout"
                maxLength={60}
                className="w-full sm:w-40"
              />
              <Input
                name="quick_info_value"
                defaultValue={e.value}
                placeholder="11 AM"
                maxLength={200}
                className="w-full flex-1 sm:w-auto"
              />
              <button
                type="button"
                onClick={() => removeEntry(i)}
                className="focus-ring rounded-sm text-xs text-muted hover:text-danger-fg"
                aria-label={`Remove entry ${i + 1}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addEntry}
          disabled={entries.length >= 12}
          className="focus-ring mt-2 rounded-sm text-xs font-medium text-fg hover:underline disabled:opacity-40"
        >
          + Add entry
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SimpleField
          id="checkout_time"
          label="Checkout time"
          value={page.checkout_time}
          placeholder="11:00 AM"
        />
        <SimpleField
          id="contact_phone"
          label="Front desk phone"
          value={page.contact_phone}
          placeholder="+1 (555) 010-0100"
        />
        <SimpleField
          id="parking"
          label="Parking"
          value={page.parking}
          placeholder="Self-park, $25/day"
        />
        <SimpleField
          id="pet_policy"
          label="Pet policy"
          value={page.pet_policy}
          placeholder="Pets welcome under 30 lbs"
        />
        <SimpleField
          id="smoking_policy"
          label="Smoking policy"
          value={page.smoking_policy}
          placeholder="No smoking indoors"
        />
      </div>

      {state.error ? (
        <p className="text-sm text-danger-fg" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success-fg">{state.success}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save page'}
      </Button>
    </form>
  )
}

function SimpleField({
  id,
  label,
  value,
  placeholder,
}: {
  id: string
  label: string
  value: string | null
  placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        defaultValue={value ?? ''}
        placeholder={placeholder}
        maxLength={200}
      />
    </div>
  )
}
