import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requirePlatformAdmin } from '@/lib/auth/session'
import { getDataSource, listRecentRuns } from '@/lib/market/registry'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = Promise<{ source: string }>

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  ok: 'success',
  partial: 'warning',
  error: 'danger',
  skipped: 'neutral',
  running: 'info',
}

export default async function DataSourceDetailPage({ params }: { params: Params }) {
  await requirePlatformAdmin()
  const { source } = await params
  const registry = await getDataSource(source)
  if (!registry) notFound()

  const [runs, recentObsCount, latestSample] = await Promise.all([
    listRecentRuns(source, 30),
    countObservationsLast24h(source),
    loadLatestObservation(source),
  ])

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div>
        <Link
          href="/admin/data-sources"
          className="focus-ring rounded-sm text-sm font-medium text-muted hover:text-fg"
        >
          ← All sources
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">
          {registry.display_name}
        </h1>
        <p className="mt-1 text-sm text-muted max-w-2xl">{registry.description}</p>
      </div>

      <section
        aria-label="Source overview"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <Kpi label="Enabled" value={registry.enabled ? 'Yes' : 'No'} tone={registry.enabled ? 'success' : 'neutral'} />
        <Kpi label="API key" value={apiKeyStatus(registry)} />
        <Kpi label="Obs last 24h" value={recentObsCount} />
        <Kpi label="Total obs." value={Number(registry.observations_total).toLocaleString()} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardBody className="text-sm space-y-2">
          <Row label="Source key">
            <code className="rounded bg-surface-muted px-1.5 py-0.5">{registry.source}</code>
          </Row>
          <Row label="Cron schedule">
            <code className="rounded bg-surface-muted px-1.5 py-0.5">{registry.cron_schedule ?? '—'}</code>
          </Row>
          <Row label="Cron path">
            <code className="rounded bg-surface-muted px-1.5 py-0.5">{registry.cron_path ?? '—'}</code>
          </Row>
          <Row label="API key env var">
            {registry.api_key_env_var ? (
              <code className="rounded bg-surface-muted px-1.5 py-0.5">{registry.api_key_env_var}</code>
            ) : (
              <span className="text-muted">none</span>
            )}
          </Row>
          <Row label="Feeds signals">
            <span className="text-muted">{registry.required_for_signals.join(', ') || '—'}</span>
          </Row>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-5 py-3 font-medium">Started</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Duration</th>
                  <th className="px-5 py-3 font-medium tabular-nums text-right">API calls</th>
                  <th className="px-5 py-3 font-medium tabular-nums text-right">Rows</th>
                  <th className="px-5 py-3 font-medium">Error sample</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-6 text-sm text-muted text-center">
                      No runs recorded yet. Run-now from the source list to create one.
                    </td>
                  </tr>
                ) : (
                  runs.map((r) => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 align-top text-xs text-muted">
                        {new Date(r.started_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: 'numeric',
                        })}
                      </td>
                      <td className="px-5 py-3 align-top">
                        <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge>
                      </td>
                      <td className="px-5 py-3 align-top text-xs text-muted">
                        {r.finished_at
                          ? `${durationMs(r.started_at, r.finished_at)} ms`
                          : '…'}
                      </td>
                      <td className="px-5 py-3 align-top tabular-nums text-right text-muted">
                        {r.api_calls}
                      </td>
                      <td className="px-5 py-3 align-top tabular-nums text-right text-muted">
                        {r.rows_ingested}
                      </td>
                      <td className="px-5 py-3 align-top">
                        {r.error_sample ? (
                          <pre className="max-w-md whitespace-pre-wrap text-[10px] text-danger-fg">
                            {r.error_sample}
                          </pre>
                        ) : (
                          <span className="text-xs text-subtle">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest observation</CardTitle>
        </CardHeader>
        <CardBody>
          {latestSample ? (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-surface-muted p-4 text-[10px] text-fg">
              {JSON.stringify(latestSample, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted">No observations yet from this source.</p>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-subtle/60 py-2 last:border-b-0">
      <span className="text-xs uppercase tracking-wider text-subtle">{label}</span>
      <span>{children}</span>
    </div>
  )
}

function Kpi({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string | number
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
      <p className={`mt-1 text-xl font-semibold tracking-tight tabular-nums ${toneClass}`}>
        {value}
      </p>
    </Card>
  )
}

function apiKeyStatus(
  registry: { api_key_env_var: string | null },
): string {
  if (!registry.api_key_env_var) return 'not required'
  return process.env[registry.api_key_env_var]?.trim() ? 'set' : 'missing'
}

function durationMs(startedAt: string, finishedAt: string): number {
  return Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime())
}

async function countObservationsLast24h(source: string): Promise<number> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('external_observations')
    .select('id', { count: 'exact', head: true })
    .eq('source', source)
    .gte('ingested_at', since)
  return count ?? 0
}

async function loadLatestObservation(source: string): Promise<unknown | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('external_observations')
    .select('target_kind, target_key, geo_key, payload, observed_at, ingested_at')
    .eq('source', source)
    .order('ingested_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}
