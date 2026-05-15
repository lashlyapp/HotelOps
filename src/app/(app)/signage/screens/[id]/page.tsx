import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  SignagePlaylist,
  SignageSchedule,
  SignageScreen,
} from '@/lib/supabase/types'
import {
  deleteScheduleAction,
  deleteScreenAction,
  unpairScreenAction,
} from '../../actions'
import { isScreenOnline } from '../../_lib/labels'
import { playerUrlFor } from '../../_lib/player-url'
import { RenameScreenForm } from './rename-form'
import { ScheduleForm } from './schedule-form'

export default async function ScreenDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireOrgUser()
  const admin = createAdminClient()

  const { data: screenRow } = await admin
    .from('signage_screens')
    .select('*')
    .eq('id', id)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!screenRow) notFound()
  const screen = screenRow as SignageScreen
  const property = session.properties.find((p) => p.id === screen.property_id)
  const isOwner = session.profile.role === 'org_owner'

  const [{ data: playlistRows }, { data: scheduleRows }] = await Promise.all([
    admin
      .from('signage_playlists')
      .select('*')
      .eq('property_id', screen.property_id)
      .order('name', { ascending: true }),
    admin
      .from('signage_schedules')
      .select('*')
      .eq('screen_id', screen.id)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false }),
  ])
  const playlists = (playlistRows ?? []) as SignagePlaylist[]
  const schedules = (scheduleRows ?? []) as SignageSchedule[]

  const online = isScreenOnline(screen.last_heartbeat_at)
  const playerUrl = playerUrlFor(screen.player_token)
  const pairing =
    screen.pairing_code &&
    screen.pairing_code_expires_at &&
    new Date(screen.pairing_code_expires_at) > new Date()
      ? screen.pairing_code
      : null

  return (
    <div className="p-4 sm:p-8 space-y-5 max-w-5xl">
      <div>
        <Link
          href="/signage"
          className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
        >
          ← Back to screens
        </Link>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-fg">
          {screen.nickname}
        </h2>
        <p className="mt-1 text-xs text-subtle">
          {property?.name ?? 'Unknown property'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {pairing ? (
          <Badge tone="warning">Awaiting pair · {pairing}</Badge>
        ) : online ? (
          <Badge tone="success">Online</Badge>
        ) : (
          <Badge tone="neutral">Offline</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Player URL</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-sm">
          <p className="text-muted">
            Open this in the TV browser if the pairing flow doesn&apos;t
            persist (e.g. Fire TV with cookies cleared).
          </p>
          <code className="block break-all rounded-md bg-surface-muted p-3 font-mono text-xs text-fg">
            {playerUrl}
          </code>
          {screen.last_user_agent ? (
            <p className="text-xs text-subtle">
              Last seen on: <span className="font-mono">{screen.last_user_agent}</span>
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rename</CardTitle>
        </CardHeader>
        <CardBody>
          <RenameScreenForm id={screen.id} initial={screen.nickname} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-muted">
            Assign playlists to time windows. Highest priority that overlaps
            &quot;now&quot; wins. If no schedule matches, the property&apos;s
            default playlist plays.
          </p>

          {schedules.length === 0 ? (
            <p className="text-sm text-subtle">No schedules yet.</p>
          ) : (
            <ul className="space-y-2">
              {schedules.map((sch) => {
                const playlist = playlists.find((p) => p.id === sch.playlist_id)
                return (
                  <li
                    key={sch.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border-subtle bg-surface px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg">
                        {playlist?.name ?? '(deleted playlist)'}{' '}
                        <span className="ml-1 text-xs text-subtle">
                          priority {sch.priority}
                        </span>
                      </p>
                      <p className="text-xs text-muted">
                        {scheduleDescription(sch)}
                      </p>
                    </div>
                    <form action={deleteScheduleAction}>
                      <input type="hidden" name="id" value={sch.id} />
                      <input
                        type="hidden"
                        name="screen_id"
                        value={screen.id}
                      />
                      <button
                        type="submit"
                        className="focus-ring rounded-sm text-xs text-muted hover:text-danger-fg"
                      >
                        Remove
                      </button>
                    </form>
                  </li>
                )
              })}
            </ul>
          )}

          {playlists.length === 0 ? (
            <p className="text-sm text-muted">
              No playlists yet for this property.{' '}
              <Link
                href="/signage/playlists"
                className="focus-ring rounded-sm font-medium text-fg underline"
              >
                Create one
              </Link>
              .
            </p>
          ) : (
            <div className="border-t border-border-subtle pt-4">
              <h4 className="mb-2 text-sm font-semibold text-fg">
                Add a schedule
              </h4>
              <ScheduleForm screenId={screen.id} playlists={playlists} />
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Maintenance</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3 sm:flex-row">
          <form action={unpairScreenAction}>
            <input type="hidden" name="id" value={screen.id} />
            <button
              type="submit"
              className="focus-ring rounded-md border border-border-default px-3 py-2 text-sm font-medium text-fg hover:bg-surface-muted"
            >
              Unpair (rotate token)
            </button>
          </form>
          {isOwner ? (
            <form action={deleteScreenAction}>
              <input type="hidden" name="id" value={screen.id} />
              <button
                type="submit"
                className="focus-ring rounded-md px-3 py-2 text-sm font-medium text-danger-fg hover:underline"
              >
                Delete screen
              </button>
            </form>
          ) : null}
        </CardBody>
      </Card>
    </div>
  )
}

function scheduleDescription(s: SignageSchedule): string {
  const parts: string[] = []
  if (s.starts_on && s.ends_on) {
    parts.push(`${s.starts_on} → ${s.ends_on}`)
  } else if (s.starts_on) {
    parts.push(`from ${s.starts_on}`)
  } else if (s.ends_on) {
    parts.push(`until ${s.ends_on}`)
  }
  if (s.start_time && s.end_time) {
    parts.push(`${s.start_time}–${s.end_time}`)
  }
  if (parts.length === 0) return 'Always'
  return parts.join(' · ')
}
