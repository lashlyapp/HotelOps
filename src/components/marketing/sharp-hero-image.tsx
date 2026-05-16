import Image from 'next/image'

/**
 * Hero-image renderer for the Adobe Stock landscape source files
 * that we crop into portrait/square containers. Next.js' default
 * WebP re-encoding visibly softens these crops on desktop, but
 * shipping the raw 300–400 KB JPEG on mobile is wasteful. So we
 * render two variants:
 *
 *   - mobile/tablet: Next.js Image at quality 95 (still optimized
 *     and responsive, just less aggressively compressed).
 *   - desktop (lg+): a plain <img> pointing at the raw asset, with
 *     loading="lazy" so the browser skips the fetch on smaller
 *     viewports (display:none + lazy = no network request in
 *     Chrome / Firefox / Safari).
 *
 * Use this in place of <Image> for any /public/AdobeStock_*.jpeg
 * render that's force-cropped to a portrait or square container.
 */
export function SharpHeroImage({
  src,
  alt,
  sizes,
  priority,
  className = '',
}: {
  src: string
  alt: string
  sizes: string
  priority?: boolean
  className?: string
}) {
  const objectClass = `object-cover ${className}`.trim()
  return (
    <>
      <Image
        src={src}
        alt={alt}
        fill
        quality={95}
        sizes={sizes}
        priority={priority}
        className={`${objectClass} lg:hidden`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className={`absolute inset-0 hidden h-full w-full ${objectClass} lg:block`}
      />
    </>
  )
}
