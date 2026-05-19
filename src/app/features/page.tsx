import Link from 'next/link'
import type { Metadata } from 'next'
import { Footer } from '@/components/layout/footer'
import { FeatureGrid } from '@/components/marketing/feature-grid'
import { PublicHeader } from '@/components/marketing/public-header'
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
    "AI market intelligence at the core — daily executive briefing, OTA pricing radar, auto-detected comp set, demand signals, review intelligence. Plus the operational platform: work orders, events, signage, branded arrival pages. One license, one flat per-property price.",
  alternates: { canonical: `https://www.${BRAND.domain}/features` },
  openGraph: {
    type: 'website',
    title: `Features — ${BRAND.name}`,
    description:
      "AI market intelligence + the operational platform for boutique hotels — all in one license.",
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
      <PublicHeader dict={dict} active="features" />

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
