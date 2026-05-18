import 'server-only'

/**
 * Helper that generates the "Pick a time" grid on /demo.
 *
 * Three deliberate UX decisions baked in:
 *
 *  1. Times are presented as US Pacific (PT) only — that's the
 *     founder's timezone. Showing local-timezone-converted slots
 *     would be nicer in theory but worse in practice: an EU prospect
 *     seeing 9 AM their time means we're booking calls at midnight
 *     on our end. Better to be explicit about PT and let
 *     international prospects do the math.
 *
 *  2. Some slots show as taken (not selectable). Rather than randomly
 *     marking ~half as unavailable — which can read as fake —
 *     unavailability is deterministic per (date, hour) so the same
 *     visitor sees the same grid on refresh. Density (~50% taken)
 *     is honest given that the founder also has internal meetings,
 *     existing customer calls, etc.
 *
 *  3. We never show an entirely empty day or an entirely available
 *     day — guaranteed mix. Empty-day reads as "no inquiries";
 *     fully-available reads as "they're desperate." Both kill
 *     credibility.
 */

export type SlotStatus = 'available' | 'taken'

export type Slot = {
  /** Stable identifier passed back through the form. Encodes the
   *  date + hour so the booking action can render a human label
   *  in the email without trusting the client. */
  id: string
  /** Display label, e.g. "9:00 AM ET". */
  label: string
  status: SlotStatus
}

export type SlotDay = {
  /** ISO YYYY-MM-DD in the founder's timezone (ET). */
  date: string
  /** Display label, e.g. "Mon, May 18". */
  label: string
  slots: Slot[]
}

/** PT clock hours offered to visitors (skips noon for lunch). */
const SLOT_HOURS_PT = [9, 10, 11, 13, 14, 15, 16] as const

/** Minimum lead time, in calendar days, before the first selectable
 *  slot. Three days gives the founder a working buffer to prep, and
 *  filters out "ASAP" tire-kickers. */
const MIN_LEAD_DAYS = 3

/** How many business days the grid shows. Picked to comfortably fit
 *  in one row on desktop without horizontal scroll. */
const SLOT_DAYS_COUNT = 7

/** Deterministic FNV-1a-ish hash. Stable across page reloads so
 *  the same visitor doesn't see availability flicker between
 *  refreshes. */
function hashKey(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h
}

/** Return the next N business days as ISO date strings, skipping the
 *  first `leadDays` calendar days from `from` so the earliest slot
 *  the visitor sees is at least that many days out. */
function nextBusinessDays(
  count: number,
  from: Date,
  leadDays: number,
): string[] {
  const out: string[] = []
  const cursor = new Date(from)
  cursor.setUTCHours(0, 0, 0, 0)
  // Skip the lead-time window. The loop below increments before each
  // weekday check, so pre-advance by (leadDays - 1) here to land on
  // `from + leadDays` on the first iteration.
  cursor.setUTCDate(cursor.getUTCDate() + (leadDays - 1))
  while (out.length < count) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    const day = cursor.getUTCDay()
    if (day !== 0 && day !== 6) {
      out.push(cursor.toISOString().slice(0, 10))
    }
  }
  return out
}

function statusForRaw(date: string, hourPt: number): SlotStatus {
  return hashKey(`${date}:${hourPt}`) % 100 < 55 ? 'taken' : 'available'
}

/**
 * Build a per-day list of slots, then enforce the "always at least
 * one available + one taken per day" guarantee so the grid never
 * reads as either dead or desperate.
 */
function withMixGuarantee(
  date: string,
  raw: { hour: number; status: SlotStatus }[],
): { hour: number; status: SlotStatus }[] {
  const availableCount = raw.filter((s) => s.status === 'available').length
  const takenCount = raw.length - availableCount
  if (availableCount > 0 && takenCount > 0) return raw
  // Flip the slot at index `seed` to balance the day.
  const seed = hashKey(date) % raw.length
  const target = raw[seed]
  if (!target) return raw
  return raw.map((s, i) =>
    i === seed
      ? {
          hour: s.hour,
          status: availableCount === 0 ? 'available' : 'taken',
        }
      : s,
  )
}

function formatHourLabel(hour24: number): string {
  const hour12 = ((hour24 + 11) % 12) + 1
  const ampm = hour24 < 12 ? 'AM' : 'PM'
  return `${hour12}:00 ${ampm} PT`
}

function formatDayLabel(isoDate: string): string {
  // Format in en-US locale because the day label uses
  // "Mon, May 18" abbreviations regardless of visitor locale.
  // Visitor-facing copy around it is localized; this label is
  // intentionally consistent.
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function buildDemoSlotDays(now: Date = new Date()): SlotDay[] {
  const days = nextBusinessDays(SLOT_DAYS_COUNT, now, MIN_LEAD_DAYS)
  return days.map((date) => {
    const raw = SLOT_HOURS_PT.map((hour) => ({
      hour,
      status: statusForRaw(date, hour),
    }))
    const balanced = withMixGuarantee(date, raw)
    return {
      date,
      label: formatDayLabel(date),
      slots: balanced.map(({ hour, status }) => ({
        id: `${date}T${String(hour).padStart(2, '0')}:00PT`,
        label: formatHourLabel(hour),
        status,
      })),
    }
  })
}

/**
 * Server-side enforcement of the lead-time rule. The UI hides
 * sub-lead-time dates, but the slot_id is just a form value — a
 * crafted submission could try to book inside the window. Booking
 * actions call this to reject those before sending the OTP email.
 */
export function isSlotWithinLeadTime(
  parsedDate: string,
  now: Date = new Date(),
): boolean {
  const cursor = new Date(now)
  cursor.setUTCHours(0, 0, 0, 0)
  cursor.setUTCDate(cursor.getUTCDate() + MIN_LEAD_DAYS)
  const minIso = cursor.toISOString().slice(0, 10)
  return parsedDate >= minIso
}

/**
 * Parse a slot id back to its date + hour parts. Used by the
 * booking server action to render a clean human label in the
 * notification emails ("9:00 AM PT on Mon, May 18, 2026").
 *
 * Returns null on garbage input — callers treat that as a bad
 * request rather than crashing.
 */
export function parseSlotId(slotId: string): {
  date: string
  hour: number
  /** UTC instant representing the slot. The slot hour is in
   *  America/Los_Angeles (PT) — we naively offset by 8h to get
   *  UTC, which is correct for PST and one hour off during PDT.
   *  Acceptable for an admin sort/group key; not used to send a
   *  calendar invite (the founder does that by hand). */
  at: Date
  humanLabel: string
} | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):00PT$/.exec(slotId)
  if (!m) return null
  const [, date, hourStr] = m
  const hour = Number.parseInt(hourStr, 10)
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null
  const at = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00-08:00`)
  if (Number.isNaN(at.getTime())) return null
  const dayLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return {
    date,
    hour,
    at,
    humanLabel: `${formatHourLabel(hour)} on ${dayLabel}`,
  }
}
