import Link from 'next/link'
import type { Metadata } from 'next'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import { BRAND } from '@/lib/brand'
import { type Dictionary, getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'

export const metadata: Metadata = {
  title: `Pricing — ${BRAND.name}`,
  description:
    "Flat per-property pricing for the boutique-hotel back-office layer that runs alongside your PMS. $100/property/month base. Optional add-ons for unlimited signage and guest arrival.",
  alternates: { canonical: `https://www.${BRAND.domain}/pricing` },
  openGraph: {
    type: 'website',
    title: `Pricing — ${BRAND.name}`,
    description:
      "Back-office operations for boutique hotels, alongside any PMS. Flat per-property pricing — $100/mo base, $188 with everything on.",
    url: `https://www.${BRAND.domain}/pricing`,
    siteName: BRAND.name,
  },
}

export default async function PricingPage() {
  const locale = await getLocale()
  const dict = getDictionary(locale)
  const t = dict.pricing

  return (
    <div className="flex flex-1 flex-col">
      <PublicHeader t={dict} />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-12 lg:pt-24 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t.eyebrow}
          </p>
          <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-fg leading-[1.05]">
            {t.headline}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted leading-relaxed">
            {t.sub}
          </p>
        </section>

        {/* ─── Plan cards ────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-8">
          <div className="grid gap-5 lg:grid-cols-3">
            <PlanCard
              label={t.plans.base.label}
              price="$100"
              cadence={t.cadence}
              tag={t.tagRequired}
              tagTone="primary"
              body={t.plans.base.body}
              features={t.plans.base.features}
            />
            <PlanCard
              label={t.plans.signage.label}
              price="+$49"
              cadence={t.cadence}
              tag={t.tagOptional}
              body={t.plans.signage.body}
              features={t.plans.signage.features}
            />
            <PlanCard
              label={t.plans.guest.label}
              price="+$39"
              cadence={t.cadence}
              tag={t.tagOptional}
              body={t.plans.guest.body}
              features={t.plans.guest.features}
            />
          </div>
          <p className="mt-6 text-center text-xs text-subtle">
            {t.midCycleNote}
          </p>
        </section>

        {/* ─── Comparison table (SEO + sales weapon) ─────────────────── */}
        <section className="border-y border-border-subtle bg-surface-muted/40 scroll-mt-20" id="compare">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t.compare.eyebrow}
              </p>
              <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
                {t.compare.headline}
              </h2>
              <p className="mt-4 text-base text-muted leading-relaxed">
                {t.compare.intro}
              </p>
            </div>

            <div className="mt-10 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-subtle">
                  <tr>
                    <th className="px-4 py-3 font-medium">
                      {t.compare.headers.need}
                    </th>
                    <th className="px-4 py-3 font-medium">
                      {t.compare.headers.tool}
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      {t.compare.headers.standaloneCost}
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      {t.compare.headers.withUs}
                    </th>
                  </tr>
                </thead>
                {/* Table body left in English: competitor names + prices
                    are market-specific data, not chrome. Localized
                    European competitor rows (Mews app store, Lybra,
                    etc.) land in a follow-up content PR. */}
                <tbody className="divide-y divide-border-subtle bg-surface">
                  <CompareRow
                    need="Maintenance + ticketing"
                    competitor="Quore / HotSOS"
                    competitorCost="$130–$200"
                    hotelopsCost="included"
                  />
                  <CompareRow
                    need="Event / banquet management"
                    competitor="Tripleseat / Event Temple"
                    competitorCost="$150–$200"
                    hotelopsCost="included"
                  />
                  <CompareRow
                    need="IT inventory + password vault"
                    competitor="1Password + Confluence"
                    competitorCost="$30"
                    hotelopsCost="included"
                  />
                  <CompareRow
                    need="Media DAM"
                    competitor="Cloudinary"
                    competitorCost="$50"
                    hotelopsCost="included"
                  />
                  <CompareRow
                    need="Digital signage (6 screens)"
                    competitor="Yodeck / OptiSigns"
                    competitorCost="$60–$90"
                    hotelopsCost="$49"
                  />
                  <CompareRow
                    need="Guest arrival / concierge"
                    competitor="Duve / Canary"
                    competitorCost="$120–$240"
                    hotelopsCost="$39"
                  />
                  <tr className="bg-surface-muted/60 font-medium">
                    <td className="px-4 py-3 text-fg">
                      {t.compare.monthlyTotal}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {t.compare.alaCarte}
                    </td>
                    <td className="px-4 py-3 text-right text-fg tabular-nums">
                      ~$580
                    </td>
                    <td className="px-4 py-3 text-right text-fg tabular-nums">
                      $188
                    </td>
                  </tr>
                  <tr className="bg-success-bg/30 font-semibold">
                    <td className="px-4 py-3 text-fg" colSpan={2}>
                      {t.compare.savings}
                    </td>
                    <td
                      className="px-4 py-3 text-right text-success-fg tabular-nums"
                      colSpan={2}
                    >
                      $392 / month (68%)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-6 max-w-2xl text-xs text-subtle">
              {t.compare.footnote}
            </p>
          </div>
        </section>

        {/* ─── FAQ (SEO long-tail) ───────────────────────────────────── */}
        <section className="border-t border-border-subtle bg-surface-muted/40">
          <div className="mx-auto max-w-3xl px-6 py-20">
            <h2 className="text-3xl font-semibold tracking-tight text-fg">
              {t.faq.heading}
            </h2>
            <div className="mt-8 space-y-6">
              {t.faq.items.map((item) => (
                <Faq key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA ───────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
            {t.cta.headline}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted leading-relaxed">
            {t.cta.sub}
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
            >
              {t.cta.button}
            </Link>
          </div>
        </section>
      </main>

      <Footer variant="public" />
    </div>
  )
}

function PublicHeader({ t }: { t: Dictionary }) {
  return (
    <header className="border-b border-border-subtle">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Wordmark size="md" href="/" />
        <nav
          aria-label="Primary"
          className="hidden items-center gap-1 text-sm sm:flex"
        >
          <Link
            href="/#work-orders"
            className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
          >
            {t.nav.workOrders}
          </Link>
          <Link
            href="/#signage"
            className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
          >
            {t.nav.signage}
          </Link>
          <Link
            href="/#arrival"
            className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
          >
            {t.nav.arrival}
          </Link>
          <Link
            href="/features"
            className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
          >
            {t.features.navLabel}
          </Link>
          <Link
            href="/pricing"
            className="focus-ring rounded-md px-3 py-1.5 font-medium text-fg"
          >
            {t.nav.pricing}
          </Link>
          <Link
            href="/blog"
            className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
          >
            {t.blog.navLabel}
          </Link>
          <Link
            href="/about"
            className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
          >
            {t.about.navLabel}
          </Link>
          <Link
            href="/demo"
            className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
          >
            {t.demo.navLabel}
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="focus-ring rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
          >
            {t.common.logIn}
          </Link>
          <Link
            href="/signup"
            className="focus-ring inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover transition-colors"
          >
            {t.common.signUp}
          </Link>
        </div>
      </div>
    </header>
  )
}

function PlanCard({
  label,
  price,
  cadence,
  tag,
  tagTone,
  body,
  features,
}: {
  label: string
  price: string
  cadence: string
  tag: string
  tagTone?: 'primary'
  body: string
  features: readonly string[]
}) {
  const tagClass =
    tagTone === 'primary'
      ? 'bg-primary text-primary-fg'
      : 'bg-surface-muted text-muted'
  return (
    <Card className="h-full">
      <CardBody className="flex h-full flex-col gap-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-fg">
            {label}
          </h3>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${tagClass}`}
          >
            {tag}
          </span>
        </div>
        <div>
          <p className="text-4xl font-semibold text-fg tabular-nums">
            {price}
          </p>
          <p className="text-xs text-subtle">{cadence}</p>
        </div>
        <p className="text-sm text-muted leading-relaxed">{body}</p>
        <ul className="mt-auto space-y-2 text-sm text-fg">
          {features.map((f) => (
            <li key={f} className="flex gap-2">
              <span
                aria-hidden
                className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-fg"
              />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}

function CompareRow({
  need,
  competitor,
  competitorCost,
  hotelopsCost,
}: {
  need: string
  competitor: string
  competitorCost: string
  hotelopsCost: string
}) {
  return (
    <tr>
      <td className="px-4 py-3 text-fg">{need}</td>
      <td className="px-4 py-3 text-muted">{competitor}</td>
      <td className="px-4 py-3 text-right text-muted tabular-nums">
        {competitorCost}
      </td>
      <td className="px-4 py-3 text-right text-fg tabular-nums">
        {hotelopsCost}
      </td>
    </tr>
  )
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-fg">{q}</h3>
      <p className="mt-2 text-sm text-muted leading-relaxed">{a}</p>
    </div>
  )
}
