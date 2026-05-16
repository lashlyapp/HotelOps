import Link from 'next/link'
import type { Metadata } from 'next'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { FeatureGrid } from '@/components/marketing/feature-grid'
import { BRAND } from '@/lib/brand'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'

/**
 * Dedicated features catalog page. Hosts the FeatureGrid that
 * previously lived on the landing page — moved here so / focuses on
 * narrative (positioning → markets → outcomes → modules → CTA) and
 * /features serves as the depth reference for buyers who want the
 * full surface in one scan.
 *
 * SEO: meta title is "Features — MyHotelOps" so the page ranks for
 * intent-driven searches like "myhotelops features" and
 * "boutique hotel software features."
 */
export const metadata: Metadata = {
  title: `Features — ${BRAND.name}`,
  description:
    "Every MyHotelOps feature in one place — work orders, events, IT hub, signage, branded arrival pages, multi-property console, and more. Per-property pricing, no per-seat or per-screen surprises.",
  alternates: { canonical: `https://www.${BRAND.domain}/features` },
  openGraph: {
    type: 'website',
    title: `Features — ${BRAND.name}`,
    description:
      "The full operations stack for boutique hotels — operations, guest-facing, media, multi-property, billing.",
    url: `https://www.${BRAND.domain}/features`,
    siteName: BRAND.name,
  },
}

export default async function FeaturesPage() {
  const locale = await getLocale()
  const dict = getDictionary(locale)
  const t = dict.features

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Wordmark size="md" href="/" />
          <nav
            aria-label="Primary"
            className="hidden items-center gap-1 text-sm sm:flex"
          >
            <Link
              href="/features"
              className="focus-ring rounded-md px-3 py-1.5 font-medium text-fg"
            >
              {t.navLabel}
            </Link>
            <Link
              href="/pricing"
              className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
            >
              {dict.nav.pricing}
            </Link>
            <Link
              href="/blog"
              className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
            >
              {dict.blog.navLabel}
            </Link>
            <Link
              href="/about"
              className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
            >
              {dict.about.navLabel}
            </Link>
            <Link
              href="/demo"
              className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
            >
              {dict.demo.navLabel}
            </Link>
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

      <main className="flex-1">
        <FeatureGrid t={t} />

        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
            {dict.about.ctaHeading}
          </h2>
          <p className="mx-auto mt-3 text-base text-muted leading-relaxed">
            {dict.about.ctaSub}
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
            >
              {dict.about.ctaButton}
            </Link>
          </div>
        </section>
      </main>

      <Footer variant="public" />
    </div>
  )
}
