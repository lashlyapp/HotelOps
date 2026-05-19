import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

export function PropertyTabs({
  properties,
  basePath = '/market',
}: {
  properties: { slug: string; name: string; active: boolean }[]
  basePath?: string
}) {
  if (properties.length <= 1) return null
  return (
    <div className="flex flex-wrap gap-1 border-b border-border-subtle">
      {properties.map((p) => (
        <Link
          key={p.slug}
          href={`${basePath}?property=${p.slug}`}
          className={cn(
            'focus-ring -mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            p.active
              ? 'border-fg text-fg'
              : 'border-transparent text-muted hover:text-fg',
          )}
        >
          {p.name}
        </Link>
      ))}
    </div>
  )
}
