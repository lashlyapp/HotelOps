import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

type Size = 'sm' | 'md' | 'lg'

const sizeStyles: Record<Size, string> = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-xl',
}

/**
 * Wordmark for MyHotelOps. Two-tone: "My" in muted, "HotelOps" in primary fg.
 * Uses a tiny square mark to give it visual weight at small sizes.
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
        className="inline-block h-4 w-4 rounded-xs bg-fg"
        style={{ borderRadius: 4 }}
      />
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
