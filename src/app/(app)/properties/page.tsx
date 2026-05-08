import Link from 'next/link'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgOwner } from '@/lib/auth/session'
import { listMediaForPrefix } from '@/lib/r2/list'
import { computeLibraryStats, formatBytes } from '@/lib/r2/stats'
import { r2PublicUrl } from '@/lib/r2/client'
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
          Each property has its own media catalog and details. Click a property
          to edit its address, logo, and contact info.
        </p>
      </div>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-border-subtle">
          {rows.length === 0 ? (
            <li className="p-8 text-center text-sm text-muted">
              No properties yet. Add the first one below.
            </li>
          ) : (
            rows.map(({ property, stats }) => (
              <li
                key={property.id}
                className="flex items-center gap-4 p-4 hover:bg-surface-muted transition-colors"
              >
                <PropertyAvatar
                  name={property.name}
                  logoKey={property.logo_key}
                  logoUploadedAt={property.logo_uploaded_at}
                />

                <Link
                  href={`/properties/${property.id}`}
                  className="focus-ring rounded-sm flex-1 min-w-0"
                >
                  <p className="text-sm font-medium text-fg truncate">
                    {property.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted truncate">
                    {formatLocation(property) ?? 'No address yet'}
                  </p>
                </Link>

                <div className="hidden sm:block text-right">
                  <p className="text-xs text-subtle uppercase tracking-wider">
                    Library
                  </p>
                  <p className="text-sm text-fg tabular-nums">
                    {stats.fileCount} · {formatBytes(stats.totalBytes)}
                  </p>
                </div>

                <RemovePropertyButton propertyId={property.id} />
              </li>
            ))
          )}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add property</CardTitle>
        </CardHeader>
        <CardBody>
          <AddPropertyForm />
        </CardBody>
      </Card>
    </div>
  )
}

function PropertyAvatar({
  name,
  logoKey,
  logoUploadedAt,
}: {
  name: string
  logoKey: string | null
  logoUploadedAt: string | null
}) {
  if (logoKey) {
    const cacheBust = logoUploadedAt
      ? `?t=${new Date(logoUploadedAt).getTime()}`
      : ''
    return (
      <div className="size-12 shrink-0 rounded-md overflow-hidden border border-border-subtle bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${r2PublicUrl(logoKey)}${cacheBust}`}
          alt={`${name} logo`}
          className="size-full object-cover"
        />
      </div>
    )
  }
  const initial = name.charAt(0).toUpperCase()
  return (
    <div className="size-12 shrink-0 rounded-md border border-border-subtle bg-surface-muted flex items-center justify-center text-sm font-semibold text-muted">
      {initial}
    </div>
  )
}

function formatLocation(p: {
  city: string | null
  state: string | null
  country: string
}): string | null {
  const parts = [p.city, p.state].filter(Boolean) as string[]
  if (parts.length === 0) return null
  const main = parts.join(', ')
  return p.country && p.country !== 'US' ? `${main} · ${p.country}` : main
}
