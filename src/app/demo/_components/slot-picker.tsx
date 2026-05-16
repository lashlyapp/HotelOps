'use client'

import { useActionState, useMemo, useState } from 'react'
import { OTP_LENGTH, OTP_TTL_MINUTES } from '@/lib/auth/otp-constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { interpolate } from '@/lib/i18n/interpolate'
import type { Locale } from '@/lib/i18n/locales'
import type { SlotDay } from '@/lib/marketing/demo-slots'
import {
  requestDemoBookingOtp,
  resendDemoBookingOtp,
  verifyDemoBookingOtp,
  type BookingActionResult,
} from '../actions'

const initial: BookingActionResult = {}

const TEXTAREA_CLASSES =
  'w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg shadow-xs ' +
  'placeholder:text-subtle ' +
  'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] ' +
  'focus-ring focus:border-border-strong ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

const SELECT_CLASSES =
  'w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg shadow-xs ' +
  'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] ' +
  'focus-ring focus:border-border-strong'

/** Languages the founder actually speaks. Drives the booking form's
 *  preferred-language picker. Order: visitor's locale floats to top
 *  when applicable so the prefill matches their context. */
const SUPPORTED_CALL_LANGUAGES = ['en', 'es', 'ko', 'vi'] as const
type CallLanguage = (typeof SUPPORTED_CALL_LANGUAGES)[number]

function defaultCallLanguage(locale: Locale): CallLanguage {
  if ((SUPPORTED_CALL_LANGUAGES as readonly string[]).includes(locale)) {
    return locale as CallLanguage
  }
  return 'en'
}

/**
 * Four-step picker for /demo:
 *
 *   1. Date tabs + slots for the active date.
 *   2. Booking form (name / email / hotel / properties /
 *      preferred language / notes). Submitting triggers an OTP
 *      email rather than the final notification.
 *   3. OTP entry — visitor types the 6-digit code from email,
 *      submitting finalizes the booking.
 *   4. Success confirmation.
 *
 * Auto-selects the first day with availability on mount. Each date
 * tab shows how many slots are available so the choice carries
 * context.
 */
export function SlotPicker({
  days,
  t,
  taken,
  selectInstruction,
  locale,
}: {
  days: SlotDay[]
  t: Dictionary['demo']
  taken: string
  selectInstruction: string
  locale: Locale
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
  const [requestState, requestAction, requestPending] = useActionState(
    requestDemoBookingOtp,
    initial,
  )
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifyDemoBookingOtp,
    initial,
  )
  const [resendState, resendAction, resendPending] = useActionState(
    resendDemoBookingOtp,
    initial,
  )

  // Three terminal states the picker can end up in:
  //   - verifyState.success → step 4 (booked)
  //   - requestState.otpSent → step 3 (OTP entry)
  //   - selected → step 2 (form)
  //   - else → step 1 (slot picker)
  if (verifyState.success) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-success-bg bg-success-bg/30 p-6 sm:p-8 text-center"
      >
        <h3 className="text-lg font-semibold text-fg">
          {t.booking.successHeading}
        </h3>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          {interpolate(t.booking.successBody, {
            email: verifyState.success.email,
          })}
        </p>
      </div>
    )
  }

  // Step 3 — OTP entry.
  if (requestState.otpSent) {
    const { email, slotHumanLabel } = requestState.otpSent
    const resentJustNow = resendState.resent && !resendState.error
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-fg">{t.otp.heading}</h3>
          <p className="mt-1 text-sm text-muted leading-relaxed">
            {interpolate(t.otp.subtitle, {
              n: OTP_LENGTH,
              email,
              minutes: OTP_TTL_MINUTES,
            })}
          </p>
          <p className="mt-1 text-xs text-subtle">{slotHumanLabel}</p>
        </div>

        <form action={verifyAction} className="space-y-4" noValidate>
          <input type="hidden" name="email" value={email} />
          <div className="space-y-1.5">
            <Label htmlFor="demo-otp">{t.otp.codeLabel}</Label>
            <Input
              id="demo-otp"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={OTP_LENGTH}
              required
              placeholder={'•'.repeat(OTP_LENGTH)}
              className="text-center tracking-[0.5em] font-mono text-base"
            />
            <p className="text-xs text-subtle">
              {interpolate(t.otp.codeHint, { n: OTP_LENGTH })}
            </p>
          </div>

          {verifyState.error ? (
            <p className="text-sm text-danger-fg">{verifyState.error}</p>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={verifyPending}
          >
            {verifyPending ? t.otp.ctaVerifying : t.otp.cta}
          </Button>
        </form>

        <div className="flex items-center justify-between gap-3 text-xs">
          <form action={resendAction}>
            <input type="hidden" name="email" value={email} />
            <button
              type="submit"
              disabled={resendPending}
              className="focus-ring rounded-sm font-medium text-muted hover:text-fg disabled:opacity-50"
            >
              {resendPending ? t.otp.resending : t.otp.resend}
            </button>
          </form>
          <button
            type="button"
            onClick={() => {
              // Reset everything back to step 1 (slot picker). Cheap
              // page reload is the cleanest way to clear all three
              // action states without exposing reset() plumbing.
              window.location.reload()
            }}
            className="focus-ring rounded-sm font-medium text-muted hover:text-fg"
          >
            {t.otp.startOver}
          </button>
        </div>

        {resentJustNow ? (
          <p className="text-xs text-subtle">{t.otp.resentRecently}</p>
        ) : null}
        {resendState.error ? (
          <p className="text-xs text-danger-fg">{resendState.error}</p>
        ) : null}
      </div>
    )
  }

  // Step 2 — booking form.
  if (selected) {
    return (
      <form action={requestAction} className="space-y-4" noValidate>
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
          <Label htmlFor="demo-language">{t.booking.preferredLanguage}</Label>
          <select
            id="demo-language"
            name="preferred_language"
            required
            defaultValue={defaultCallLanguage(locale)}
            className={SELECT_CLASSES}
          >
            <option value="en">{t.booking.languageEn}</option>
            <option value="es">{t.booking.languageEs}</option>
            <option value="ko">{t.booking.languageKo}</option>
            <option value="vi">{t.booking.languageVi}</option>
          </select>
          <p className="text-xs text-subtle">
            {t.booking.preferredLanguageHint}
          </p>
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

        {requestState.error ? (
          <p className="text-sm text-danger-fg">{requestState.error}</p>
        ) : null}

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={requestPending}
        >
          {requestPending ? t.booking.ctaSending : t.booking.cta}
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

function splitDayLabel(label: string): [string, string] {
  const match = /^([A-Za-z]+),\s+\w+\s+(\d+)$/.exec(label)
  if (!match) return [label, '']
  return [match[1], match[2]]
}
