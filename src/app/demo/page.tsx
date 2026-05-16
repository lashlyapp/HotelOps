import Link from 'next/link'
import type { Metadata } from 'next'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import { BRAND } from '@/lib/brand'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'
import { interpolate } from '@/lib/i18n/interpolate'
import { buildDemoSlotDays } from '@/lib/marketing/demo-slots'
import { SlotPicker } from './_components/slot-picker'

/**
 * Founder-sales lane sitting alongside the PLG self-serve flow. For
 * higher-intent buyers (multi-property groups, switchers, EU prospects
 * who want a human first) — books a 30-minute call.
 *
 * The page renders a 5-business-day calendar grid in US Eastern with
 * a deterministic mix of available + taken slots so it never reads
 * as either dead or desperate. Selecting a slot opens an inline
 * booking form; the bookDemoSlot server action emails the founder
 * and confirms back to the visitor. Founder follows up by replying
 * to the notification with a Google Meet calendar invite.
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

  const days = buildDemoSlotDays()

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
              className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
            >
              {dict.features.navLabel}
            </Link>
            <Link
              href="/pricing"
              className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
            >
              {dict.nav.pricing}
            </Link>
            <Link
              href="/about"
              className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
            >
              {dict.about.navLabel}
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

          <Card className="mt-10">
            <CardBody className="space-y-5 p-6 sm:p-8">
              <div>
                <h2 className="text-lg font-semibold text-fg">
                  {t.calendar.heading}
                </h2>
                <p className="mt-1 text-sm text-muted leading-relaxed">
                  {t.calendar.intro}
                </p>
              </div>
              <SlotPicker
                days={days}
                t={t}
                taken={t.calendar.takenLabel}
                selectInstruction={t.calendar.selectInstruction}
              />
              <p className="border-t border-border-subtle pt-4 text-xs text-subtle leading-relaxed">
                {interpolate(t.calendar.fallback, {
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
