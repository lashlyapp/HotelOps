'use client'

import { useActionState, useMemo, useState } from 'react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  updateAppointment,
  type UpdateAppointmentResult,
} from '../actions'
import type { AppointmentRow } from '../page'

const initialUpdate: UpdateAppointmentResult = {}

type View = 'list' | 'calendar'

/**
 * Three-pane shell for /admin/appointments:
 *
 *   - tab strip (List / Calendar)
 *   - main pane: table or calendar grid
 *   - side pane: detail + edit form for the selected appointment
 *
 * Detail pane opens to the right on desktop, slides up as a sheet
 * on mobile. Selecting an appointment in either view targets the
 * same pane.
 */
export function AppointmentsClient({
  appointments,
  upcoming,
  past,
}: {
  appointments: AppointmentRow[]
  upcoming: AppointmentRow[]
  past: AppointmentRow[]
}) {
  const [view, setView] = useState<View>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(
    () => appointments.find((a) => a.id === selectedId) ?? null,
    [appointments, selectedId],
  )

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="View"
        className="inline-flex rounded-md border border-border-subtle bg-surface-muted p-0.5 text-sm"
      >
        <TabButton active={view === 'list'} onClick={() => setView('list')}>
          List
        </TabButton>
        <TabButton
          active={view === 'calendar'}
          onClick={() => setView('calendar')}
        >
          Calendar
        </TabButton>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          {view === 'list' ? (
            <ListView
              upcoming={upcoming}
              past={past}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ) : (
            <CalendarView
              appointments={appointments}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>

        <div className="min-w-0">
          {selected ? (
            <DetailPanel
              key={selected.id}
              appointment={selected}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <Card className="p-6 text-sm text-muted">
              Select an appointment to view details or change its status.
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        'focus-ring rounded-[5px] px-3 py-1.5 font-medium transition-colors',
        active
          ? 'bg-surface text-fg shadow-xs'
          : 'text-muted hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// List view — table grouped into Upcoming / Past
// ---------------------------------------------------------------------------
function ListView({
  upcoming,
  past,
  selectedId,
  onSelect,
}: {
  upcoming: AppointmentRow[]
  past: AppointmentRow[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {

  return (
    <div className="space-y-6">
      <ListSection
        heading="Upcoming"
        empty="No upcoming appointments."
        rows={upcoming}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      <ListSection
        heading="Past & resolved"
        empty="No past appointments."
        rows={past}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </div>
  )
}

function ListSection({
  heading,
  empty,
  rows,
  selectedId,
  onSelect,
}: {
  heading: string
  empty: string
  rows: AppointmentRow[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (rows.length === 0) {
    return (
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-fg">{heading}</h2>
        <p className="mt-1 text-xs text-muted">{empty}</p>
      </Card>
    )
  }
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border-subtle bg-surface-muted px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">{heading}</h2>
        <p className="mt-0.5 text-xs text-muted">
          {rows.length} {rows.length === 1 ? 'appointment' : 'appointments'}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
            <tr>
              <th className="px-4 py-2.5 font-medium">When (PT)</th>
              <th className="px-4 py-2.5 font-medium">Hotel</th>
              <th className="px-4 py-2.5 font-medium">Contact</th>
              <th className="px-4 py-2.5 font-medium">Lang</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onSelect(row.id)}
                className={[
                  'cursor-pointer border-t border-border-subtle transition-colors',
                  selectedId === row.id
                    ? 'bg-info-bg/30'
                    : 'hover:bg-surface-muted',
                ].join(' ')}
              >
                <td className="px-4 py-2.5 text-fg whitespace-nowrap">
                  {formatSlotPT(row.slot_at)}
                </td>
                <td className="px-4 py-2.5 text-fg">
                  <div className="font-medium">{row.hotel_name}</div>
                  {row.property_count ? (
                    <div className="text-xs text-subtle">
                      {row.property_count} property
                      {row.property_count === '1' ? '' : 'ies'}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 text-muted">
                  <div>{row.visitor_name}</div>
                  <div className="text-xs">
                    <a
                      href={`mailto:${row.visitor_email}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:underline"
                    >
                      {row.visitor_email}
                    </a>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs font-mono text-subtle uppercase">
                  {row.preferred_language}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Calendar view — weekly agenda
// ---------------------------------------------------------------------------
function CalendarView({
  appointments,
  selectedId,
  onSelect,
}: {
  appointments: AppointmentRow[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  // Anchor on the visitor's current Monday; user navigates ± weeks.
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()))
  const weekDays = useMemo(() => buildWeekDays(anchor), [anchor])

  const byDay = useMemo(() => {
    const map = new Map<string, AppointmentRow[]>()
    for (const a of appointments) {
      const k = isoDateInPT(new Date(a.slot_at))
      const arr = map.get(k) ?? []
      arr.push(a)
      map.set(k, arr)
    }
    for (const v of map.values()) {
      v.sort(
        (x, y) => new Date(x.slot_at).getTime() - new Date(y.slot_at).getTime(),
      )
    }
    return map
  }, [appointments])

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-muted px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">
            {formatWeekRange(weekDays[0], weekDays[6])}
          </h2>
          <p className="mt-0.5 text-xs text-muted">All times Pacific (PT).</p>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <NavBtn onClick={() => setAnchor(addDays(anchor, -7))}>←</NavBtn>
          <NavBtn onClick={() => setAnchor(startOfWeek(new Date()))}>
            Today
          </NavBtn>
          <NavBtn onClick={() => setAnchor(addDays(anchor, 7))}>→</NavBtn>
        </div>
      </div>

      <div className="grid grid-cols-7 divide-x divide-border-subtle">
        {weekDays.map((day) => {
          const isoKey = isoDateInPT(day)
          const dayItems = byDay.get(isoKey) ?? []
          const isToday = isoKey === isoDateInPT(new Date())
          return (
            <div key={isoKey} className="min-h-[140px] p-2 text-xs">
              <div className="flex items-baseline justify-between gap-1">
                <span className="font-semibold uppercase tracking-wider text-subtle">
                  {day.toLocaleDateString('en-US', {
                    weekday: 'short',
                    timeZone: 'America/Los_Angeles',
                  })}
                </span>
                <span
                  className={[
                    'text-base font-semibold',
                    isToday ? 'text-fg' : 'text-muted',
                  ].join(' ')}
                >
                  {day.toLocaleDateString('en-US', {
                    day: 'numeric',
                    timeZone: 'America/Los_Angeles',
                  })}
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {dayItems.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(a.id)}
                      className={[
                        'focus-ring w-full rounded-md border px-2 py-1.5 text-left transition-colors',
                        selectedId === a.id
                          ? 'border-info-fg bg-info-bg/40'
                          : 'border-border-subtle bg-surface hover:bg-surface-muted',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[11px] font-semibold text-fg">
                          {formatHourPT(a.slot_at)}
                        </span>
                        <StatusDot status={a.status} />
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted">
                        {a.hotel_name}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function NavBtn({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring rounded-md border border-border-subtle bg-surface px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-muted hover:text-fg transition-colors"
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Detail panel — edit form
// ---------------------------------------------------------------------------
function DetailPanel({
  appointment,
  onClose,
}: {
  appointment: AppointmentRow
  onClose: () => void
}) {
  const [state, action, pending] = useActionState(
    updateAppointment,
    initialUpdate,
  )

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-fg truncate">
            {appointment.hotel_name}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {formatSlotPT(appointment.slot_at)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring rounded-sm text-xs font-medium text-muted hover:text-fg"
        >
          Close
        </button>
      </div>

      <dl className="space-y-2 text-xs">
        <Field label="Contact">
          <div className="font-medium text-fg">{appointment.visitor_name}</div>
          <a
            href={`mailto:${appointment.visitor_email}`}
            className="text-fg hover:underline"
          >
            {appointment.visitor_email}
          </a>
        </Field>
        <Field label="Properties">
          {appointment.property_count ?? '—'}
        </Field>
        <Field label="Call language">
          {languageLabel(appointment.preferred_language)}
        </Field>
        <Field label="Booked from">
          <span className="font-mono uppercase">
            {appointment.visitor_locale}
          </span>{' '}
          locale
        </Field>
        {appointment.visitor_notes ? (
          <Field label="Visitor notes">
            <p className="whitespace-pre-wrap text-muted">
              {appointment.visitor_notes}
            </p>
          </Field>
        ) : null}
      </dl>

      <form action={action} className="space-y-3 pt-2 border-t border-border-subtle">
        <input type="hidden" name="id" value={appointment.id} />
        <div className="space-y-1.5">
          <label
            htmlFor="appointment-status"
            className="block text-xs font-semibold uppercase tracking-wider text-subtle"
          >
            Status
          </label>
          <select
            id="appointment-status"
            name="status"
            defaultValue={appointment.status}
            className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg focus-ring"
          >
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="no_show">No-show</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="appointment-notes"
            className="block text-xs font-semibold uppercase tracking-wider text-subtle"
          >
            Internal notes
          </label>
          <textarea
            id="appointment-notes"
            name="admin_notes"
            defaultValue={appointment.admin_notes ?? ''}
            rows={4}
            maxLength={2000}
            className="w-full rounded-md border border-border-default bg-surface px-3 py-2 text-sm text-fg focus-ring"
            placeholder="Outcome, follow-ups, anything to remember about this call…"
          />
        </div>
        {state.error ? (
          <p className="text-xs text-danger-fg">{state.error}</p>
        ) : null}
        {state.ok ? (
          <p className="text-xs text-success-fg">Saved.</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="focus-ring inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </Card>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-fg">{children}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STATUS_TONE: Record<AppointmentRow['status'], BadgeProps['tone']> = {
  scheduled: 'info',
  completed: 'success',
  no_show: 'warning',
  cancelled: 'neutral',
}

const STATUS_LABEL: Record<AppointmentRow['status'], string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  no_show: 'No-show',
  cancelled: 'Cancelled',
}

function StatusBadge({ status }: { status: AppointmentRow['status'] }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
}

function StatusDot({ status }: { status: AppointmentRow['status'] }) {
  const color =
    status === 'scheduled'
      ? 'bg-info-fg'
      : status === 'completed'
        ? 'bg-success-fg'
        : status === 'no_show'
          ? 'bg-warning-fg'
          : 'bg-subtle'
  return (
    <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />
  )
}

function languageLabel(code: 'en' | 'es' | 'ko' | 'vi'): string {
  switch (code) {
    case 'en':
      return 'English'
    case 'es':
      return 'Español'
    case 'ko':
      return '한국어'
    case 'vi':
      return 'Tiếng Việt'
  }
}

function formatSlotPT(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  })
}

function formatHourPT(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  })
}

/** ISO YYYY-MM-DD of a Date as observed in Los Angeles. The
 *  Intl.DateTimeFormat trick avoids any DST/timezone math. */
function isoDateInPT(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Los_Angeles',
  }).formatToParts(d)
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

function startOfWeek(d: Date): Date {
  // Monday-start week. Convert to PT calendar date first so weeks
  // align with how the founder thinks about them.
  const isoStr = isoDateInPT(d)
  const local = new Date(`${isoStr}T12:00:00-08:00`)
  const day = local.getUTCDay() // 0=Sun…6=Sat
  const diff = (day + 6) % 7 // 0 if Mon, 6 if Sun
  local.setUTCDate(local.getUTCDate() - diff)
  return local
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + n)
  return out
}

function buildWeekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

function formatWeekRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Los_Angeles',
    })
  return `${fmt(start)} – ${fmt(end)}`
}
