import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

type Size = 'sm' | 'md' | 'lg'

const sizeStyles: Record<Size, string> = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-xl',
}

const markSizeStyles: Record<Size, string> = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
}

/**
 * Wordmark for MyHotelOps. Two-tone: "My" in muted, "HotelOps" in primary fg.
 * Mark is a rounded black square with a white concierge-bell glyph — the
 * service-dome silhouette common to hospitality branding.
 */
export function Wordmark({
  size = 'md',
  href,
  className,
}: {
  size?: Size
  href?: string
  className?: string
}) {
  const content = (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-semibold tracking-tight',
        sizeStyles[size],
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-flex items-center justify-center rounded-md bg-fg text-bg',
          markSizeStyles[size],
        )}
        style={{ borderRadius: 6 }}
      >
        <ConciergeBellGlyph />
      </span>
      <span className="text-fg">
        <span className="text-muted font-normal">My</span>
        HotelOps
      </span>
    </span>
  )

  if (href) {
    return (
      <Link href={href} className="focus-ring rounded-sm">
        {content}
      </Link>
    )
  }
  return content
}

function ConciergeBellGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[68%] w-[68%]"
      aria-hidden
    >
      {/* handle on top of the dome */}
      <path d="M10 5h4" />
      <path d="M12 5v3" />
      {/* domed cover */}
      <path d="M4 17a8 8 0 0 1 16 0" />
      {/* serving plate / base */}
      <path d="M2 19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2H2v2Z" />
    </svg>
  )
}
