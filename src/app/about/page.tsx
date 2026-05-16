import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import { BRAND, BRAND_ADDRESS_LINES } from '@/lib/brand'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'

// Hospitality hero image already licensed in /public — reuse rather
// than spin up a new asset for the About hero. The reception-desk
// shot reads warm + craft-oriented which matches the page tone.
const HERO_IMAGE = '/AdobeStock_327436679.jpeg'

export const metadata: Metadata = {
  title: `About — ${BRAND.name}`,
  description:
    "Why we built MyHotelOps: the boutique hotel market is underserved by software built for big chains. We make the operations layer that runs alongside any PMS, for the GMs and owners actually living the day-to-day.",
  alternates: { canonical: `https://www.${BRAND.domain}/about` },
  openGraph: {
    type: 'website',
    title: `About — ${BRAND.name}`,
    description:
      "Built for boutique hotel owners and GMs. The operations layer that runs alongside any PMS.",
    url: `https://www.${BRAND.domain}/about`,
    siteName: BRAND.name,
  },
}

export default async function AboutPage() {
  const locale = await getLocale()
  const dict = getDictionary(locale)
  const t = dict.about

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
              href="/pricing"
              className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
            >
              {dict.nav.pricing}
            </Link>
            <Link
              href="/about"
              className="focus-ring rounded-md px-3 py-1.5 font-medium text-fg"
            >
              {t.navLabel}
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
        {/* ─── Hero ───────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-12 lg:pt-24">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t.eyebrow}
              </p>
              <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-fg leading-[1.05]">
                {t.headline}
              </h1>
            </div>
            <div className="relative aspect-[5/4] overflow-hidden rounded-2xl border border-border-subtle bg-surface-muted">
              <Image
                src={HERO_IMAGE}
                alt="Hotel reception desk with brass service bell"
                fill
                priority
                sizes="(min-width: 1024px) 540px, (min-width: 640px) 90vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        {/* ─── Mission ────────────────────────────────────────────────── */}
        <section className="border-y border-border-subtle bg-surface-muted/40">
          <div className="mx-auto max-w-3xl px-6 py-16">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-fg">
              {t.missionHeading}
            </h2>
            <p className="mt-4 text-base text-muted leading-relaxed">
              {t.missionBody}
            </p>
          </div>
        </section>

        {/* ─── What we do + Who we serve ──────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-fg">
                {t.sectionTwoHeading}
              </h2>
              <p className="mt-4 text-base text-muted leading-relaxed">
                {t.sectionTwoBody}
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-fg">
                {t.sectionThreeHeading}
              </h2>
              <p className="mt-4 text-base text-muted leading-relaxed">
                {t.sectionThreeBody}
              </p>
            </div>
          </div>
        </section>

        {/* ─── Contact + mailing address ─────────────────────────────── */}
        <section className="border-t border-border-subtle bg-surface-muted/40">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="grid gap-6 sm:grid-cols-2">
              <Card>
                <CardBody className="p-6 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
                    {t.supportHeading}
                  </p>
                  <a
                    href={`mailto:${BRAND.supportEmail}`}
                    className="text-base font-medium text-fg hover:underline"
                  >
                    {BRAND.supportEmail}
                  </a>
                </CardBody>
              </Card>
              <Card>
                <CardBody className="p-6 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
                    {t.addressHeading}
                  </p>
                  <address className="not-italic text-sm text-fg leading-6">
                    {BRAND_ADDRESS_LINES.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </address>
                </CardBody>
              </Card>
            </div>
          </div>
        </section>

        {/* ─── CTA ───────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
            {t.ctaHeading}
          </h2>
          <p className="mx-auto mt-3 text-base text-muted leading-relaxed">
            {t.ctaSub}
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
            >
              {t.ctaButton}
            </Link>
          </div>
        </section>
      </main>

      <Footer variant="public" />
    </div>
  )
}
