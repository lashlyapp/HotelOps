'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { interpolate } from '@/lib/i18n/interpolate'
import type { SlotDay } from '@/lib/marketing/demo-slots'
import { bookDemoSlot, type BookingActionResult } from '../actions'

const initial: BookingActionResult = {}

const TEXTAREA_CLASSES =
  'w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg shadow-xs ' +
  'placeholder:text-subtle ' +
  'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] ' +
  'focus-ring focus:border-border-strong ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Two-step interactive picker for /demo:
 *
 *   1. Grid view — vertical list of days, each with horizontal slot
 *      pills. Available slots are buttons; taken slots are
 *      visibly disabled. Tapping an available slot transitions to
 *      step 2.
 *   2. Booking form — name / email / hotel / properties / notes
 *      inputs prefixed with the chosen slot label and a "change
 *      time" link back to step 1. Submit hits bookDemoSlot.
 *
 * Success state replaces the form with a confirmation block. Server
 * action fires the founder notification + visitor confirmation
 * emails; UX intentionally never claims the slot is "reserved" —
 * the founder still has to send the calendar invite.
 */
export function SlotPicker({
  days,
  t,
  taken,
  selectInstruction,
}: {
  days: SlotDay[]
  t: Dictionary['demo']
  taken: string
  selectInstruction: string
}) {
  const [selected, setSelected] = useState<{
    id: string
    label: string
    day: string
  } | null>(null)
  const [state, action, pending] = useActionState(bookDemoSlot, initial)

  if (state.success) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-success-bg bg-success-bg/30 p-6 sm:p-8 text-center"
      >
        <h3 className="text-lg font-semibold text-fg">
          {t.booking.successHeading}
        </h3>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          {interpolate(t.booking.successBody, { email: state.success.email })}
        </p>
      </div>
    )
  }

  if (selected) {
    return (
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="slot_id" value={selected.id} />

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-fg">
            {interpolate(t.booking.heading, {
              slot: `${selected.day} · ${selected.label}`,
            })}
          </p>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="focus-ring rounded-sm text-xs font-medium text-muted hover:text-fg"
          >
            ← {t.booking.changeSlot}
          </button>
        </div>
        <p className="text-xs text-subtle">{t.booking.subtitle}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="demo-name">{t.booking.yourName}</Label>
            <Input
              id="demo-name"
              name="name"
              type="text"
              autoComplete="name"
              required
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="demo-email">{t.booking.workEmail}</Label>
            <Input
              id="demo-email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="demo-hotel">{t.booking.hotelName}</Label>
            <Input
              id="demo-hotel"
              name="hotel_name"
              type="text"
              autoComplete="organization"
              required
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="demo-pcount">{t.booking.propertyCount}</Label>
            <Input
              id="demo-pcount"
              name="property_count"
              type="text"
              inputMode="numeric"
              maxLength={10}
              placeholder={t.booking.propertyCountPlaceholder}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="demo-notes">{t.booking.notes}</Label>
          <textarea
            id="demo-notes"
            name="notes"
            rows={3}
            maxLength={2000}
            className={TEXTAREA_CLASSES}
            placeholder={t.booking.notesPlaceholder}
          />
        </div>

        {state.error ? (
          <p className="text-sm text-danger-fg">{state.error}</p>
        ) : null}

        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? t.booking.ctaSending : t.booking.cta}
        </Button>
      </form>
    )
  }

  // Step 1 — slot grid.
  return (
    <div className="space-y-5">
      <p className="text-xs text-subtle">{selectInstruction}</p>
      <ul className="space-y-3">
        {days.map((day) => (
          <li key={day.date} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
              {day.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {day.slots.map((slot) => {
                if (slot.status === 'taken') {
                  return (
                    <span
                      key={slot.id}
                      aria-disabled
                      className="inline-flex items-center rounded-md border border-border-subtle bg-surface-muted px-3 py-1.5 text-xs text-subtle line-through cursor-not-allowed"
                      title={taken}
                    >
                      {slot.label}
                    </span>
                  )
                }
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() =>
                      setSelected({
                        id: slot.id,
                        label: slot.label,
                        day: day.label,
                      })
                    }
                    className="focus-ring inline-flex items-center rounded-md border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-muted transition-colors"
                  >
                    {slot.label}
                  </button>
                )
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
