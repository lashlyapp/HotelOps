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

/** Return the next N business days as ISO date strings. */
function nextBusinessDays(count: number, from: Date): string[] {
  const out: string[] = []
  const cursor = new Date(from)
  cursor.setUTCHours(0, 0, 0, 0)
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
  const days = nextBusinessDays(5, now)
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
  humanLabel: string
} | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):00PT$/.exec(slotId)
  if (!m) return null
  const [, date, hourStr] = m
  const hour = Number.parseInt(hourStr, 10)
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null
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
    humanLabel: `${formatHourLabel(hour)} on ${dayLabel}`,
  }
}
