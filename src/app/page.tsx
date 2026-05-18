import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Footer } from '@/components/layout/footer'
import { AsianDestinationsBand } from '@/components/marketing/asian-destinations-band'
import { DestinationsBand } from '@/components/marketing/destinations-band'
import { PublicHeader } from '@/components/marketing/public-header'
import { SharpHeroImage } from '@/components/marketing/sharp-hero-image'
import { UseCasesBand } from '@/components/marketing/use-cases-band'
import { Card, CardBody } from '@/components/ui/card'
import { BRAND } from '@/lib/brand'
import { getDictionary, type Dictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'
import { interpolate } from '@/lib/i18n/interpolate'
import { createClient } from '@/lib/supabase/server'

// Public marketing imagery. The originals are large (multi-MB) JPEGs in
// /public; next/image generates optimized variants on Vercel automatically,
// so the browser never sees the raw size.
const HERO_IMAGE = '/AdobeStock_94588323.jpeg' // manager with tablet, warm hotel interior
const RECEPTION_IMAGE = '/AdobeStock_327436679.jpeg' // reception desk with brass service bell
const GUEST_ROOM_IMAGE = '/AdobeStock_131189921.jpeg' // modern guest room
const LOBBY_IMAGE = '/AdobeStock_1896833868.jpeg'
const EXTERIOR_IMAGE = '/AdobeStock_1951250090.jpeg'

export const metadata: Metadata = {
  title: `${BRAND.name} — The operations layer for boutique hotels`,
  description:
    "MyHotelOps is the back-office software boutique hotels run alongside their PMS. Maintenance, events, vendors, signage, guest arrival — everything your reservation system doesn't do, in one place. Built for owners, GMs, and managers.",
  alternates: { canonical: `https://www.${BRAND.domain}/` },
  openGraph: {
    type: 'website',
    title: `${BRAND.name} — Everything your PMS doesn't do`,
    description:
      "Back-office operations for boutique hotels — maintenance, events, vendors, signage, guest arrival. Runs alongside any PMS. Flat per-property pricing.",
    url: `https://www.${BRAND.domain}/`,
    siteName: BRAND.name,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} — Everything your PMS doesn't do`,
    description:
      "Back-office operations for boutique hotels. Runs alongside any PMS. Flat per-property pricing.",
  },
}

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    redirect(profile?.role === 'platform_admin' ? '/admin' : '/dashboard')
  }

  const locale = await getLocale()
  const t = getDictionary(locale)

  // Structured data: three SoftwareApplication entries (one per anchor
  // keyword section) plus the Organization. Google understands these as
  // distinct features of one product when listed under @graph, which is
  // the closest schema for "one tool, three buyer intents".
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `https://www.${BRAND.domain}/#org`,
        name: BRAND.legalName,
        url: `https://www.${BRAND.domain}/`,
        logo: `https://www.${BRAND.domain}/HotelOps.png`,
        address: {
          '@type': 'PostalAddress',
          streetAddress: BRAND.address.line1,
          addressLocality: BRAND.address.city,
          addressRegion: BRAND.address.state,
          postalCode: BRAND.address.postalCode,
          addressCountry: 'US',
        },
        contactPoint: {
          '@type': 'ContactPoint',
          email: BRAND.supportEmail,
          contactType: 'customer support',
        },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `https://www.${BRAND.domain}/#work-orders`,
        name: `${BRAND.name} Work Orders`,
        applicationCategory: 'BusinessApplication',
        description:
          'Hotel maintenance software with photo and video work orders, Kanban board, and per-property assignment.',
        operatingSystem: 'Web',
        offers: {
          '@type': 'Offer',
          price: '100',
          priceCurrency: 'USD',
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: '100',
            priceCurrency: 'USD',
            unitText: 'property/month',
          },
        },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `https://www.${BRAND.domain}/#signage`,
        name: `${BRAND.name} Signage`,
        applicationCategory: 'BusinessApplication',
        description:
          'Hotel digital signage SaaS with unlimited screens per property, scheduling, and one-click emergency broadcast.',
        operatingSystem: 'Web',
        offers: {
          '@type': 'Offer',
          price: '49',
          priceCurrency: 'USD',
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: '49',
            priceCurrency: 'USD',
            unitText: 'property/month',
          },
        },
      },
      {
        '@type': 'Service',
        '@id': `https://www.${BRAND.domain}/#service-area`,
        name: `${BRAND.name} back-office operations for boutique hotels`,
        description:
          "Hotel back-office software that runs alongside any PMS — maintenance, events, vendors, signage, guest arrival. Built for boutique hotels in major European and Latin American markets.",
        provider: { '@id': `https://www.${BRAND.domain}/#org` },
        // Cities we localize for + bill in the local currency. Drives
        // the destinations band on / and signals regional intent to
        // search engines so the page surfaces on geo-targeted queries
        // like "hotel maintenance software Barcelona".
        areaServed: [
          { '@type': 'City', name: 'Lisbon', sameAs: 'https://en.wikipedia.org/wiki/Lisbon' },
          { '@type': 'City', name: 'Barcelona', sameAs: 'https://en.wikipedia.org/wiki/Barcelona' },
          { '@type': 'City', name: 'Paris', sameAs: 'https://en.wikipedia.org/wiki/Paris' },
          { '@type': 'City', name: 'Mexico City', sameAs: 'https://en.wikipedia.org/wiki/Mexico_City' },
        ],
        audience: {
          '@type': 'BusinessAudience',
          audienceType: 'Boutique hotel owners, general managers, and operations managers',
        },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `https://www.${BRAND.domain}/#arrival`,
        name: `${BRAND.name} Arrival`,
        applicationCategory: 'BusinessApplication',
        description:
          'Digital concierge for hotels — guest arrival pages with Wi-Fi, dining hours, menus, and a printable in-room QR card.',
        operatingSystem: 'Web',
        offers: {
          '@type': 'Offer',
          price: '39',
          priceCurrency: 'USD',
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: '39',
            priceCurrency: 'USD',
            unitText: 'property/month',
          },
        },
      },
    ],
  }

  return (
    <div className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        // Server-rendered, content is fixed, no XSS surface here.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <PublicHeader dict={t} active="home" />

      <main className="flex-1">
        {/* ─── Hero ───────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t.marketing.hero.eyebrow}
              </p>
              <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-fg leading-[1.05]">
                {t.marketing.hero.headline}
              </h1>
              <p className="mt-6 text-lg text-muted max-w-xl leading-relaxed">
                {t.marketing.hero.sub}
              </p>
              <p className="mt-3 text-sm text-muted max-w-xl leading-relaxed">
                {t.marketing.hero.personaLine}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
                >
                  {t.marketing.hero.ctaPrimary}
                </Link>
                <Link
                  href="/pricing"
                  className="focus-ring inline-flex h-11 items-center rounded-md px-5 text-base font-medium text-fg hover:bg-surface-muted transition-colors"
                >
                  {t.marketing.hero.ctaSecondary} →
                </Link>
              </div>
              <p className="mt-6 text-xs text-subtle">
                {t.marketing.hero.trialLine}
              </p>
            </div>

            <div className="relative aspect-[4/5] sm:aspect-[5/4] lg:aspect-square overflow-hidden rounded-2xl border border-border-subtle bg-surface-muted">
              <SharpHeroImage
                src={HERO_IMAGE}
                alt={t.marketing.hero.imageAlt}
                priority
                sizes="(min-width: 1024px) 540px, (min-width: 640px) 90vw, 100vw"
              />
            </div>
          </div>
        </section>

        {/* ─── Positioning band: what we are NOT ─────────────────────── */}
        <section className="border-y border-border-subtle bg-fg/[0.02]">
          <div className="mx-auto max-w-4xl px-6 py-12 lg:py-16 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t.marketing.positioning.eyebrow}
            </p>
            <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-fg">
              {t.marketing.positioning.title}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-muted leading-relaxed">
              {t.marketing.positioning.body}
            </p>
          </div>
        </section>

        {/* ─── Destinations: city-targeted cards in local languages ──── */}
        <DestinationsBand t={t} />

        {/* ─── APAC destinations: Tokyo / Seoul / Hanoi / Singapore ──── */}
        <AsianDestinationsBand t={t} />

        {/* ─── Use cases: anonymized real-customer stories ────────────── */}
        <UseCasesBand t={t.useCases} />

        {/* ─── Module: Work Orders (SEO: "hotel maintenance software") ─ */}
        <section
          id="work-orders"
          className="border-y border-border-subtle bg-surface-muted/40 scroll-mt-20"
        >
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {t.marketing.workOrders.eyebrow}
                </p>
                <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
                  {t.marketing.workOrders.headline}
                </h2>
                <p className="mt-4 text-base text-muted leading-relaxed">
                  {t.marketing.workOrders.body1}
                </p>
                <p className="mt-4 text-base text-muted leading-relaxed">
                  {t.marketing.workOrders.body2}
                </p>
                <ul className="mt-6 space-y-2 text-sm text-muted">
                  {t.marketing.workOrders.features.map((f) => (
                    <FeatureLi key={f}>{f}</FeatureLi>
                  ))}
                </ul>
              </div>
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border-subtle bg-surface">
                <SharpHeroImage
                  src={LOBBY_IMAGE}
                  alt={t.marketing.workOrders.imageAlt}
                  sizes="(min-width: 1024px) 480px, 100vw"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ─── Module: Signage (SEO: "hotel signage SaaS") ───────────── */}
        <section id="signage" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border-subtle bg-surface order-2 lg:order-1">
                <SharpHeroImage
                  src={EXTERIOR_IMAGE}
                  alt={t.marketing.signage.imageAlt}
                  sizes="(min-width: 1024px) 480px, 100vw"
                />
              </div>
              <div className="order-1 lg:order-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {t.marketing.signage.eyebrow}
                </p>
                <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
                  {t.marketing.signage.headline}
                </h2>
                <p className="mt-4 text-base text-muted leading-relaxed">
                  {t.marketing.signage.body1}
                </p>
                <p className="mt-4 text-base text-muted leading-relaxed">
                  {t.marketing.signage.body2}
                </p>
                <ul className="mt-6 space-y-2 text-sm text-muted">
                  {t.marketing.signage.features.map((f) => (
                    <FeatureLi key={f}>{f}</FeatureLi>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Module: Arrival (SEO: "hotel digital concierge") ──────── */}
        <section
          id="arrival"
          className="border-y border-border-subtle bg-surface-muted/40 scroll-mt-20"
        >
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {t.marketing.arrival.eyebrow}
                </p>
                <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
                  {t.marketing.arrival.headline}
                </h2>
                <p className="mt-4 text-base text-muted leading-relaxed">
                  {t.marketing.arrival.body1}
                </p>
                <p className="mt-4 text-base text-muted leading-relaxed">
                  {t.marketing.arrival.body2}
                </p>
                <ul className="mt-6 space-y-2 text-sm text-muted">
                  {t.marketing.arrival.features.map((f) => (
                    <FeatureLi key={f}>{f}</FeatureLi>
                  ))}
                </ul>
              </div>
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border-subtle bg-surface">
                <SharpHeroImage
                  src={GUEST_ROOM_IMAGE}
                  alt={t.marketing.arrival.imageAlt}
                  sizes="(min-width: 1024px) 480px, 100vw"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ─── Pricing teaser → /pricing ─────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t.marketing.pricingTeaser.eyebrow}
              </p>
              <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
                {t.marketing.pricingTeaser.headline}
              </h2>
              <p className="mt-4 max-w-2xl text-base text-muted leading-relaxed">
                {t.marketing.pricingTeaser.body}
              </p>
            </div>
            <PricingMini mini={t.marketing.pricingTeaser.mini} />
          </div>
          <div className="mt-10">
            <Link
              href="/pricing"
              className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
            >
              {t.marketing.pricingTeaser.cta}
            </Link>
          </div>
        </section>

        {/* ─── Identity band: built for hotels ───────────────────────── */}
        <section className="relative isolate overflow-hidden">
          <SharpHeroImage
            src={RECEPTION_IMAGE}
            alt={t.marketing.identityBand.imageAlt}
            sizes="100vw"
          />
          {/* dark overlay so the headline is readable on top of the photo */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/55 to-black/35" />
          <div className="relative mx-auto max-w-6xl px-6 py-24 lg:py-32">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
                {t.marketing.identityBand.eyebrow}
              </p>
              <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-tight">
                {t.marketing.identityBand.headline}
              </h2>
              <p className="mt-4 text-base text-white/85 leading-relaxed">
                {interpolate(t.marketing.identityBand.body, { brand: BRAND.name })}
              </p>
              <div className="mt-8">
                <Link
                  href="/signup"
                  className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-white px-6 text-base font-medium text-slate-900 hover:bg-white/90 transition-colors"
                >
                  {t.marketing.identityBand.cta}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer variant="public" />
    </div>
  )
}

function FeatureLi({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span
        aria-hidden
        className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-fg"
      />
      <span>{children}</span>
    </li>
  )
}

function PricingMini({
  mini,
}: {
  mini: Dictionary['marketing']['pricingTeaser']['mini']
}) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <Row label={mini.baseLabel} sub={mini.baseSub}>
          $100
        </Row>
        <Row label={mini.signageLabel} sub={mini.signageSub}>
          +$49
        </Row>
        <Row label={mini.guestLabel} sub={mini.guestSub}>
          +$39
        </Row>
        <Row label={mini.socialLabel} sub={mini.socialSub}>
          +$19
        </Row>
        <p className="border-t border-border-subtle pt-3 text-xs text-subtle">
          {mini.footer}
        </p>
      </CardBody>
    </Card>
  )
}

function Row({
  label,
  sub,
  children,
}: {
  label: string
  sub: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-fg">{label}</p>
        <p className="text-xs text-subtle">{sub}</p>
      </div>
      <p className="shrink-0 font-mono text-fg">{children}</p>
    </div>
  )
}
