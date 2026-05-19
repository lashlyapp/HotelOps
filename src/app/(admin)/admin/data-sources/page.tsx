import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requirePlatformAdmin } from '@/lib/auth/session'
import {
  listDataSourcesWithHealth,
  type DataSourceHealth,
} from '@/lib/market/registry'
import { RunNowForm } from './_components/run-now-form'
import { ToggleForm } from './_components/toggle-form'

// Sources whose adapters ship in this PR — anything else is shown as
// "registered, awaiting implementation" in the UI.
const RUNNABLE_SOURCES = new Set([
  'nager_holidays',
  'open_meteo',
  'wikipedia_events',
  'nws_alerts',
  'wikipedia_pageviews',
  'exchange_rate_host',
  'overpass_venues',
  'ticketmaster',
  'eventbrite',
  'tripadvisor',
])

const CATEGORY_LABEL: Record<string, string> = {
  events: 'Events',
  weather: 'Weather',
  holidays: 'Holidays',
  rates: 'Competitor rates',
  reviews: 'Reviews',
  search: 'Search intent',
  venues: 'Venues',
  macro: 'Macro context',
  disruption: 'Disruption',
}

const STATUS_TONE: Record<DataSourceHealth['status_indicator'], 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  ok: 'success',
  warn: 'warning',
  error: 'danger',
  disabled: 'neutral',
  unconfigured: 'info',
}

const STATUS_LABEL: Record<DataSourceHealth['status_indicator'], string> = {
  ok: 'Healthy',
  warn: 'Stale',
  error: 'Error',
  disabled: 'Disabled',
  unconfigured: 'Awaiting API key',
}

export default async function DataSourcesPage() {
  await requirePlatformAdmin()
  const sources = await listDataSourcesWithHealth()
  const byCategory = groupByCategory(sources)

  const totals = {
    total: sources.length,
    enabled: sources.filter((s) => s.enabled).length,
    healthy: sources.filter((s) => s.status_indicator === 'ok').length,
    error: sources.filter((s) => s.status_indicator === 'error').length,
    awaitingKey: sources.filter((s) => s.status_indicator === 'unconfigured').length,
  }

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Revenue Intelligence — data pipeline
        </h1>
        <p className="mt-1 text-sm text-muted max-w-3xl">
          One row per external data source. Toggle a source off to halt
          its cron without code changes. See{' '}
          <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">
            docs/revenue-intelligence.md
          </code>{' '}
          for the full pipeline architecture.
        </p>
      </div>

      <section
        aria-label="Pipeline overview"
        className="grid grid-cols-2 gap-3 sm:grid-cols-5"
      >
        <KpiCard label="Sources" value={totals.total} />
        <KpiCard label="Enabled" value={totals.enabled} />
        <KpiCard label="Healthy" value={totals.healthy} tone={totals.healthy > 0 ? 'success' : 'neutral'} />
        <KpiCard label="Errors" value={totals.error} tone={totals.error > 0 ? 'danger' : 'neutral'} />
        <KpiCard label="Awaiting key" value={totals.awaitingKey} tone={totals.awaitingKey > 0 ? 'info' : 'neutral'} />
      </section>

      {Object.entries(byCategory).map(([category, rows]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle>{CATEGORY_LABEL[category] ?? category}</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
                  <tr>
                    <th className="px-5 py-3 font-medium">Source</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Schedule</th>
                    <th className="px-5 py-3 font-medium">Last ok</th>
                    <th className="px-5 py-3 font-medium tabular-nums text-right">Total obs.</th>
                    <th className="px-5 py-3 font-medium text-right">Enabled</th>
                    <th className="px-5 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {rows.map((s) => (
                    <tr key={s.source}>
                      <td className="px-5 py-3 align-top">
                        <p className="text-sm font-medium text-fg">{s.display_name}</p>
                        <p className="mt-0.5 text-xs text-muted">{s.description}</p>
                        {s.api_key_env_var ? (
                          <p className="mt-0.5 text-[10px] text-subtle">
                            Env: <code className="rounded bg-surface-muted px-1 py-0.5">{s.api_key_env_var}</code>
                            {!s.api_key_present ? ' (not set)' : ''}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 align-top">
                        <Badge tone={STATUS_TONE[s.status_indicator]}>
                          {STATUS_LABEL[s.status_indicator]}
                        </Badge>
                        {s.last_error_message ? (
                          <p className="mt-1 max-w-xs truncate text-[10px] text-danger-fg" title={s.last_error_message}>
                            {s.last_error_message}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 align-top text-xs text-muted">
                        <code>{s.cron_schedule ?? '—'}</code>
                      </td>
                      <td className="px-5 py-3 align-top text-xs text-muted">
                        {s.last_ok_at
                          ? new Date(s.last_ok_at).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="px-5 py-3 align-top tabular-nums text-right text-muted">
                        {s.observations_total.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 align-top text-right">
                        <ToggleForm source={s.source} enabled={s.enabled} />
                      </td>
                      <td className="px-5 py-3 align-top text-right">
                        <RunNowForm
                          source={s.source}
                          runnable={RUNNABLE_SOURCES.has(s.source)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  )
}

function groupByCategory(rows: DataSourceHealth[]): Record<string, DataSourceHealth[]> {
  const order = ['events', 'rates', 'reviews', 'search', 'weather', 'disruption', 'holidays', 'venues', 'macro']
  const out: Record<string, DataSourceHealth[]> = {}
  for (const r of rows) {
    if (!out[r.category]) out[r.category] = []
    out[r.category].push(r)
  }
  const ordered: Record<string, DataSourceHealth[]> = {}
  for (const cat of order) {
    if (out[cat]) ordered[cat] = out[cat]
  }
  for (const [k, v] of Object.entries(out)) {
    if (!ordered[k]) ordered[k] = v
  }
  return ordered
}

function KpiCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number
  tone?: 'success' | 'danger' | 'info' | 'neutral'
}) {
  const toneClass = {
    success: 'text-success-fg',
    danger: 'text-danger-fg',
    info: 'text-info-fg',
    neutral: 'text-fg',
  }[tone]
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wider text-subtle">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${toneClass}`}>
        {value}
      </p>
    </Card>
  )
}
