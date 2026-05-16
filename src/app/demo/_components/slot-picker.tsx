'use client'

import { useActionState, useMemo, useState } from 'react'
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
 * Three-step interactive picker for /demo:
 *
 *   1. Date tabs across the top + slots for the active date
 *      below. Showing all 5 days × 7 slots at once overwhelmed
 *      the page — a Calendly-style date-then-slots flow keeps
 *      the visible surface to ~7 items, never 35.
 *   2. Booking form once a slot is picked.
 *   3. Success confirmation.
 *
 * On mount, auto-selects the first day that has at least one
 * available slot so the user lands on something actionable
 * without an extra tap. Each date tab also shows how many slots
 * are available so the choice carries context.
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
  const firstAvailableDate = useMemo(
    () =>
      days.find((d) => d.slots.some((s) => s.status === 'available'))?.date ??
      days[0]?.date ??
      '',
    [days],
  )
  const [activeDate, setActiveDate] = useState(firstAvailableDate)
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

  // Step 1 — date tabs + slots for the active day.
  const activeDay = days.find((d) => d.date === activeDate)
  const availableCountFor = (d: SlotDay) =>
    d.slots.filter((s) => s.status === 'available').length

  return (
    <div className="space-y-5">
      {/* Horizontal date tabs. Overflow-x-auto so 5+ days still
          scroll on narrow phones. snap-x keeps tap targets aligned
          to whole cards as the user swipes. */}
      <div
        role="tablist"
        aria-label="Select a date"
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory"
      >
        {days.map((day) => {
          const count = availableCountFor(day)
          const isActive = day.date === activeDate
          const isFull = count === 0
          const [weekday, dayNumber] = splitDayLabel(day.label)
          return (
            <button
              key={day.date}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-disabled={isFull}
              onClick={() => !isFull && setActiveDate(day.date)}
              disabled={isFull}
              className={[
                'focus-ring snap-start shrink-0 flex flex-col items-center justify-center',
                'w-16 sm:w-20 py-2.5 rounded-lg border transition-colors',
                isActive
                  ? 'border-fg bg-fg text-bg'
                  : isFull
                    ? 'border-border-subtle bg-surface-muted text-subtle cursor-not-allowed'
                    : 'border-border-default bg-surface text-fg hover:bg-surface-muted',
              ].join(' ')}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                {weekday}
              </span>
              <span className="text-base font-semibold leading-tight mt-0.5">
                {dayNumber}
              </span>
              <span
                className={[
                  'mt-1 text-[10px]',
                  isActive
                    ? 'opacity-80'
                    : isFull
                      ? 'text-subtle'
                      : 'text-muted',
                ].join(' ')}
              >
                {isFull ? '—' : `${count}`}
              </span>
            </button>
          )
        })}
      </div>

      <p className="text-xs text-subtle">{selectInstruction}</p>

      {/* Slots for the active day. */}
      {activeDay ? (
        <div className="flex flex-wrap gap-2">
          {activeDay.slots.map((slot) => {
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
                    day: activeDay.label,
                  })
                }
                className="focus-ring inline-flex items-center rounded-md border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-muted transition-colors"
              >
                {slot.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/** Day labels from demo-slots come in as e.g. "Mon, May 18". Split
 *  into ["Mon", "18"] for the two-line tab layout. Falls back to
 *  the full label if the format ever changes so we don't crash. */
function splitDayLabel(label: string): [string, string] {
  const match = /^([A-Za-z]+),\s+\w+\s+(\d+)$/.exec(label)
  if (!match) return [label, '']
  return [match[1], match[2]]
}
