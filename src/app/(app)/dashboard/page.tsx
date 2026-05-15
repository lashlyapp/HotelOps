import Link from 'next/link'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { listMediaForPropertyCached } from '@/lib/r2/list'
import { computeLibraryStats, formatBytes, formatRelative } from '@/lib/r2/stats'
import { UploadsChartCard } from './_components/uploads-chart-card'

export default async function DashboardPage() {
  const session = await requireOrgUser()

  // Aggregate library stats across all of the org's properties. Each list
  // is cached per-property (60s + mediaCacheTag) so repeat dashboard
  // renders don't fan out to R2 on every navigation.
  const perProperty = await Promise.all(
    session.properties.map(async (p) => ({
      property: p,
      files: await listMediaForPropertyCached(p.id, p.r2_prefix),
    })),
  )
  const allFiles = perProperty.flatMap((x) => x.files)
  const stats = computeLibraryStats(allFiles)

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-muted">
          Overview for {session.organization.name}.
        </p>
      </div>

      <section
        aria-label="Library overview"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <UploadsChartCard files={allFiles} />
        <KpiCard
          label="Storage used"
          value={formatBytes(stats.totalBytes)}
          hint={`${stats.fileCount} files · Cloudflare R2`}
        />
        <KpiCard
          label="Last upload"
          value={formatRelative(stats.lastModified)}
          hint={
            stats.lastModified
              ? new Date(stats.lastModified).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : '—'
          }
        />
      </section>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Properties</CardTitle>
          <Link
            href="/media"
            className="focus-ring rounded-sm text-xs font-medium text-muted hover:text-fg"
          >
            Open catalog →
          </Link>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
              <tr>
                <th className="px-5 py-3 font-medium">Property</th>
                <th className="px-5 py-3 font-medium">Files</th>
                <th className="px-5 py-3 font-medium">Storage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {perProperty.map(({ property, files }) => {
                const s = computeLibraryStats(files)
                return (
                  <tr key={property.id}>
                    <td className="px-5 py-3 font-medium text-fg">
                      <Link
                        href={`/media?property=${property.slug}`}
                        className="focus-ring rounded-sm hover:underline"
                      >
                        {property.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-fg tabular-nums">
                      {s.fileCount}
                    </td>
                    <td className="px-5 py-3 text-muted tabular-nums">
                      {formatBytes(s.totalBytes)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wider text-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-fg tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </Card>
  )
}
