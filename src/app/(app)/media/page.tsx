import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/session'
import { listMediaWithTags } from '@/lib/r2/list'
import {
  computeLibraryStats,
  formatBytes,
  formatRelative,
} from '@/lib/r2/stats'
import { cn } from '@/lib/utils/cn'
import { MediaBrowser } from './_components/media-browser'
import { StatCard } from './_components/stat-card'

type SearchParams = Promise<{ property?: string }>

export default async function MediaPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await requireSession()
  const { property: propertySlug } = await searchParams

  if (session.properties.length === 0) {
    return (
      <div className="p-8">
        <PageHeader title="Media catalog" />
        <p className="mt-4 text-sm text-muted">
          No properties yet. Contact your admin to add one.
        </p>
      </div>
    )
  }

  const activeProperty =
    session.properties.find((p) => p.slug === propertySlug) ??
    session.properties[0]

  if (propertySlug !== activeProperty.slug) {
    redirect(`/media?property=${activeProperty.slug}`)
  }

  const files = await listMediaWithTags(
    activeProperty.id,
    activeProperty.r2_prefix,
  )
  const stats = computeLibraryStats(files)

  return (
    <div className="p-8 space-y-6">
      <PageHeader
        title="Media catalog"
        subtitle={`Centralized library for ${session.organization.name}. Upload, tag, and share photos and videos across your properties.`}
      />

      <div className="flex flex-wrap gap-1 border-b border-border-subtle">
        {session.properties.map((property) => {
          const isActive = property.slug === activeProperty.slug
          return (
            <Link
              key={property.id}
              href={`/media?property=${property.slug}`}
              className={cn(
                'focus-ring -mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-fg text-fg'
                  : 'border-transparent text-muted hover:text-fg',
              )}
            >
              {property.name}
            </Link>
          )
        })}
      </div>

      <section
        aria-label={`${activeProperty.name} library stats`}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <StatCard
          label="Files"
          value={stats.fileCount}
          hint={`${stats.imageCount} images · ${stats.videoCount} videos`}
        />
        <StatCard
          label="Storage used"
          value={formatBytes(stats.totalBytes)}
          hint="Cloudflare R2"
        />
        <StatCard
          label="Documents"
          value={stats.documentCount + stats.otherCount}
          hint={
            stats.documentCount + stats.otherCount === 0
              ? 'PDFs and other files'
              : `${stats.documentCount} PDFs`
          }
        />
        <StatCard
          label="Last updated"
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

      <MediaBrowser
        files={files}
        propertyId={activeProperty.id}
        propertyName={activeProperty.name}
        propertySlug={activeProperty.slug}
      />
    </div>
  )
}

function PageHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
      {subtitle ? (
        <p className="mt-1 text-sm text-muted max-w-2xl">{subtitle}</p>
      ) : null}
    </div>
  )
}
