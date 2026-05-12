import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

type Size = 'sm' | 'md' | 'lg'

const sizeStyles: Record<Size, string> = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-xl',
}

const markPixelSize: Record<Size, number> = {
  sm: 20,
  md: 24,
  lg: 32,
}

/**
 * Wordmark for MyHotelOps. Two-tone: "My" in muted, "HotelOps" in primary fg.
 * Mark is a square concierge-bell icon — the hospitality service-dome glyph.
 *
 * Icon asset lives at /public/hotelops-icon.png. Replace it with a vector SVG
 * at the same path (any time, no code change) for sharper rendering and
 * better OG / favicon use; PNG is the interim while a true vector is sourced.
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
  const px = markPixelSize[size]
  const content = (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-semibold tracking-tight',
        sizeStyles[size],
        className,
      )}
    >
      <Image
        src="/hotelops-icon.png"
        alt=""
        width={px}
        height={px}
        priority
        aria-hidden
        className="shrink-0 rounded-[5px]"
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
