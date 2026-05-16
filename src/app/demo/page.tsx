import Link from 'next/link'
import type { Metadata } from 'next'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import { BRAND } from '@/lib/brand'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'
import { interpolate } from '@/lib/i18n/interpolate'

/**
 * Founder-sales lane sitting alongside the PLG self-serve flow. For
 * higher-intent buyers (multi-property groups, switchers, EU prospects
 * who want a human first) — books a 30-minute call.
 *
 * The actual scheduling is delegated to Calendly via the
 * NEXT_PUBLIC_DEMO_CALENDLY_URL env var. When unset the page degrades
 * to a mailto: fallback so the route is never broken; in production
 * set the env var to the founder's Calendly link.
 */
export const metadata: Metadata = {
  title: `Talk to us — ${BRAND.name}`,
  description:
    "Book a 30-minute walkthrough of MyHotelOps for boutique hotels. Especially useful for multi-property groups, switchers, and operators outside the US who want pricing in local currency.",
  alternates: { canonical: `https://www.${BRAND.domain}/demo` },
  openGraph: {
    type: 'website',
    title: `Talk to us — ${BRAND.name}`,
    description:
      "Book a 30-minute walkthrough of the boutique-hotel back-office layer that runs alongside any PMS.",
    url: `https://www.${BRAND.domain}/demo`,
    siteName: BRAND.name,
  },
}

export default async function DemoPage() {
  const locale = await getLocale()
  const dict = getDictionary(locale)
  const t = dict.demo

  // Calendly URL is operator-configurable. When missing we degrade to
  // an email fallback rather than rendering a broken button — that
  // way the route ships safely even before the operator wires their
  // scheduling tool up.
  const calendlyUrl = process.env.NEXT_PUBLIC_DEMO_CALENDLY_URL ?? null

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
              href="/demo"
              className="focus-ring rounded-md px-3 py-1.5 font-medium text-fg"
            >
              {t.navLabel}
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
        <section className="mx-auto max-w-3xl px-6 py-16 lg:py-24">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t.eyebrow}
            </p>
            <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-fg leading-[1.1]">
              {t.headline}
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base text-muted leading-relaxed">
              {t.sub}
            </p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <Card>
              <CardBody className="space-y-4 p-6 sm:p-8">
                <h2 className="text-lg font-semibold text-fg">
                  {t.calendly.heading}
                </h2>
                <p className="text-sm text-muted leading-relaxed">
                  {t.calendly.body}
                </p>
                {calendlyUrl ? (
                  <Link
                    href={calendlyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
                  >
                    {t.calendly.openExternal} →
                  </Link>
                ) : null}
                <p className="text-xs text-subtle leading-relaxed">
                  {interpolate(t.calendly.fallback, {
                    email: BRAND.supportEmail,
                  })
                    .split(BRAND.supportEmail)
                    .map((part, i, all) => (
                      <span key={i}>
                        {part}
                        {i < all.length - 1 ? (
                          <a
                            href={`mailto:${BRAND.supportEmail}`}
                            className="font-medium text-fg hover:underline"
                          >
                            {BRAND.supportEmail}
                          </a>
                        ) : null}
                      </span>
                    ))}
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="space-y-4 p-6 sm:p-8">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
                  {t.personaList.heading}
                </h2>
                <ul className="space-y-2 text-sm text-fg">
                  {t.personaList.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span
                        aria-hidden
                        className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-fg"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>

          <div className="mt-10 rounded-md border border-border-subtle bg-surface-muted/40 p-6 sm:p-8">
            <h2 className="text-base font-semibold text-fg">
              {t.alternative.heading}
            </h2>
            <p className="mt-2 text-sm text-muted leading-relaxed">
              {t.alternative.body}
            </p>
            <div className="mt-4">
              <Link
                href="/signup"
                className="focus-ring inline-flex h-10 items-center justify-center rounded-md border border-border-default bg-surface px-5 text-sm font-medium text-fg hover:bg-surface-muted transition-colors"
              >
                {t.alternative.cta} →
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer variant="public" />
    </div>
  )
}
