import Link from 'next/link'
import { Wordmark } from '@/components/brand/wordmark'
import { FeaturesDropdown } from '@/components/marketing/features-dropdown'
import type { Dictionary } from '@/lib/i18n/dictionaries'

/**
 * Shared top-nav for all marketing pages (/, /pricing, /features,
 * /about, /demo, /blog, /blog/[slug]). Single source of truth — the
 * old approach of inlining the same `<header>` block in each page
 * meant the FeaturesDropdown was only on the homepage and prices
 * drifted between surfaces.
 *
 * Pass `active` to highlight the current page in the nav. Pages that
 * aren't represented in the nav (e.g. blog post detail) can omit it.
 *
 * Auth + landing pages keep their own minimal headers — they
 * intentionally suppress nav distractions during conversion flows.
 */
export type PublicHeaderActive =
  | 'home'
  | 'features'
  | 'pricing'
  | 'blog'
  | 'about'
  | 'demo'
  | undefined

export function PublicHeader({
  dict,
  active,
}: {
  dict: Dictionary
  active?: PublicHeaderActive
}) {
  const navItem = (href: string, label: string, key: PublicHeaderActive) => (
    <Link
      href={href}
      className={
        active === key
          ? 'focus-ring rounded-md px-3 py-1.5 font-medium text-fg'
          : 'focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg'
      }
    >
      {label}
    </Link>
  )

  return (
    <header className="border-b border-border-subtle">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Wordmark size="md" href="/" />
        <nav
          aria-label={dict.nav.primaryLabel}
          className="hidden items-center gap-1 text-sm sm:flex"
        >
          <FeaturesDropdown
            label={dict.features.navLabel}
            items={[
              { href: '/#work-orders', label: dict.nav.workOrders },
              { href: '/features#operations', label: dict.nav.events },
              { href: '/#signage', label: dict.nav.signage },
              { href: '/#arrival', label: dict.nav.arrival },
              { href: '/features#media', label: dict.nav.media },
              { href: '/features#addons', label: dict.nav.social },
              { href: '/features#operations', label: dict.nav.itHub },
              { href: '/features', label: dict.features.allLabel },
            ]}
          />
          {navItem('/pricing', dict.nav.pricing, 'pricing')}
          {navItem('/blog', dict.blog.navLabel, 'blog')}
          {navItem('/about', dict.about.navLabel, 'about')}
          {navItem('/demo', dict.demo.navLabel, 'demo')}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="focus-ring rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
          >
            {dict.common.logIn}
          </Link>
          <Link
            href="/signup"
            className="focus-ring inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover transition-colors"
          >
            {dict.common.signUp}
          </Link>
        </div>
      </div>
    </header>
  )
}
