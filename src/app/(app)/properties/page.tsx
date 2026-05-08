import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgOwner } from '@/lib/auth/session'
import { listMediaForPrefix } from '@/lib/r2/list'
import { computeLibraryStats, formatBytes } from '@/lib/r2/stats'
import { AddPropertyForm } from './_components/add-property-form'
import { RemovePropertyButton } from './_components/remove-property-button'

export default async function PropertiesPage() {
  const session = await requireOrgOwner()

  const rows = await Promise.all(
    session.properties.map(async (p) => {
      const files = await listMediaForPrefix(p.r2_prefix)
      return { property: p, stats: computeLibraryStats(files) }
    }),
  )

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Properties
        </h1>
        <p className="mt-1 text-sm text-muted">
          Each property has its own media folder and permanent CDN URLs. Add as
          many as you operate.
        </p>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
            <tr>
              <th className="px-4 py-3 font-medium">Property</th>
              <th className="px-4 py-3 font-medium">R2 prefix</th>
              <th className="px-4 py-3 font-medium">Files</th>
              <th className="px-4 py-3 font-medium">Storage</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-sm text-muted"
                >
                  No properties yet. Add the first one below.
                </td>
              </tr>
            ) : (
              rows.map(({ property, stats }) => (
                <tr key={property.id}>
                  <td className="px-4 py-3 font-medium text-fg">
                    {property.name}
                  </td>
                  <td className="px-4 py-3 text-muted font-mono text-xs">
                    {property.r2_prefix}
                  </td>
                  <td className="px-4 py-3 text-fg tabular-nums">
                    {stats.fileCount}
                  </td>
                  <td className="px-4 py-3 text-muted tabular-nums">
                    {formatBytes(stats.totalBytes)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RemovePropertyButton propertyId={property.id} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add property</CardTitle>
        </CardHeader>
        <CardBody>
          <AddPropertyForm orgSlug={session.organization.slug} />
        </CardBody>
      </Card>
    </div>
  )
}
