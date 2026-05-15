import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import { BRAND } from '@/lib/brand'
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
  title: `${BRAND.name} — Hotel maintenance, signage, and guest experience software`,
  description:
    'HotelOps is hotel operations software for independent and boutique properties. Photo-based maintenance work orders, digital signage for every TV, and guest arrival pages — flat per-property pricing instead of per-screen or per-room.',
  alternates: { canonical: `https://www.${BRAND.domain}/` },
  openGraph: {
    type: 'website',
    title: `${BRAND.name} — One platform for hotel operations`,
    description:
      'Maintenance work orders, digital signage, and guest arrival pages — flat per-property pricing.',
    url: `https://www.${BRAND.domain}/`,
    siteName: BRAND.name,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} — One platform for hotel operations`,
    description:
      'Maintenance work orders, digital signage, and guest arrival pages — flat per-property pricing.',
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
              Work Orders
            </Link>
            <Link
              href="/#signage"
              className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
            >
              Signage
            </Link>
            <Link
              href="/#arrival"
              className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
            >
              Arrival
            </Link>
            <Link
              href="/pricing"
              className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
            >
              Pricing
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="focus-ring rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="focus-ring inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover transition-colors"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ─── Hero ───────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Hotel operations software · per property, not per seat
              </p>
              <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-fg leading-[1.05]">
                Maintenance, signage,
                <br />
                and guest experience — in one place.
              </h1>
              <p className="mt-6 text-lg text-muted max-w-xl leading-relaxed">
                {BRAND.name} replaces three line items every independent
                hotel pays for separately: maintenance ticketing, digital
                signage, and the guest arrival concierge. Flat per-property
                pricing — no per-screen, per-room, or per-seat surprise on
                the invoice.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
                >
                  Sign up
                </Link>
                <Link
                  href="/pricing"
                  className="focus-ring inline-flex h-11 items-center rounded-md px-5 text-base font-medium text-fg hover:bg-surface-muted transition-colors"
                >
                  See pricing →
                </Link>
              </div>
              <p className="mt-6 text-xs text-subtle">
                We onboard you and your team personally so you&apos;re
                running on day one — no setup wizard, no months of
                implementation.
              </p>
            </div>

            <div className="relative aspect-[4/5] sm:aspect-[5/4] lg:aspect-square overflow-hidden rounded-2xl border border-border-subtle bg-surface-muted">
              <Image
                src={HERO_IMAGE}
                alt="Hotel manager reviewing operations on a tablet"
                fill
                priority
                sizes="(min-width: 1024px) 540px, (min-width: 640px) 90vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        {/* ─── Module: Work Orders (SEO: "hotel maintenance software") ─ */}
        <section
          id="work-orders"
          className="border-y border-border-subtle bg-surface-muted/40 scroll-mt-20"
        >
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Module · included in base
                </p>
                <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
                  Hotel maintenance software, photo-first.
                </h2>
                <p className="mt-4 text-base text-muted leading-relaxed">
                  Every dripping faucet, cracked tile, and flickering ballast
                  gets a photo or short video instead of a long-form text
                  ticket. Front-desk staff snap, tag, hand off; engineering
                  closes with an after-photo. Kanban board across every
                  property, owner-override completions, full activity log.
                </p>
                <p className="mt-4 text-base text-muted leading-relaxed">
                  Replaces hotel maintenance tools like Quore ($130/mo per
                  property) and HotSOS ($200–$500/mo) — and unlike either,
                  it&apos;s already bundled into our $100/property base.
                </p>
                <ul className="mt-6 space-y-2 text-sm text-muted">
                  <FeatureLi>Snap, tag, assign — under 10 seconds end-to-end</FeatureLi>
                  <FeatureLi>Before / in-progress / after evidence trail</FeatureLi>
                  <FeatureLi>Per-property reference numbers (WO-0042)</FeatureLi>
                  <FeatureLi>Owner-override mark-done with full audit log</FeatureLi>
                </ul>
              </div>
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border-subtle bg-surface">
                <Image
                  src={LOBBY_IMAGE}
                  alt="Hotel lobby — work order capture in context"
                  fill
                  sizes="(min-width: 1024px) 480px, 100vw"
                  className="object-cover"
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
                <Image
                  src={EXTERIOR_IMAGE}
                  alt="Hotel exterior — signage across the property"
                  fill
                  sizes="(min-width: 1024px) 480px, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="order-1 lg:order-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Module · +$49/property/mo (unlimited) · 3 screens free
                </p>
                <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
                  Hotel signage SaaS without the per-screen tax.
                </h2>
                <p className="mt-4 text-base text-muted leading-relaxed">
                  Lobby TV, breakroom board, pool deck, every meeting room —
                  drive them all from one dashboard. Pair a TV with a 6-digit
                  code, schedule playlists, push a property-wide emergency
                  message in one click. Free for your first 3 screens per
                  property; unlimited above that for $49/property/month.
                </p>
                <p className="mt-4 text-base text-muted leading-relaxed">
                  Yodeck and OptiSigns charge $8–$30 per screen per month.
                  A 20-screen resort pays Yodeck $160/mo; pays us $49 — same
                  feature, less than a third of the cost.
                </p>
                <ul className="mt-6 space-y-2 text-sm text-muted">
                  <FeatureLi>Pair any Fire TV, Onn., or smart TV with a browser</FeatureLi>
                  <FeatureLi>Schedule playlists by date and time-of-day</FeatureLi>
                  <FeatureLi>Image, video, web page, or branded text card</FeatureLi>
                  <FeatureLi>Emergency takeover for the whole property</FeatureLi>
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
                  Module · +$39/property/mo
                </p>
                <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
                  A digital concierge guests already know how to use.
                </h2>
                <p className="mt-4 text-base text-muted leading-relaxed">
                  We print a QR card for each room. Your guest scans with
                  the camera app already on their phone — no install, no
                  account — and lands on a branded arrival page: Wi-Fi,
                  dining hours, gym info, room service menu, things to do
                  nearby. You edit it in five minutes; we cache it for
                  speed and host the print layout.
                </p>
                <p className="mt-4 text-base text-muted leading-relaxed">
                  Duve and Canary charge $3–$6 per occupied room per month.
                  A 40-room property pays Duve $160; pays us $39 — flat,
                  regardless of occupancy.
                </p>
                <ul className="mt-6 space-y-2 text-sm text-muted">
                  <FeatureLi>Wi-Fi auto-imported from your IT Hub</FeatureLi>
                  <FeatureLi>Restaurant + room service menus with photos and prices</FeatureLi>
                  <FeatureLi>Printable QR card with property logo and short URL</FeatureLi>
                  <FeatureLi>No guest account, no app to download</FeatureLi>
                </ul>
              </div>
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border-subtle bg-surface">
                <Image
                  src={GUEST_ROOM_IMAGE}
                  alt="Modern hotel guest room with QR card on the desk"
                  fill
                  sizes="(min-width: 1024px) 480px, 100vw"
                  className="object-cover"
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
                Pricing
              </p>
              <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
                One $100/property line item. Two add-ons. That&apos;s it.
              </h2>
              <p className="mt-4 max-w-2xl text-base text-muted leading-relaxed">
                A 40-room boutique buying the same features à la carte from
                Quore, Yodeck, and Duve pays around $580/month. With us,
                everything-on costs $188/month per property — and you can
                drop either add-on with a single click.
              </p>
            </div>
            <PricingMini />
          </div>
          <div className="mt-10">
            <Link
              href="/pricing"
              className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
            >
              See the full pricing &amp; comparison →
            </Link>
          </div>
        </section>

        {/* ─── Identity band: built for hotels ───────────────────────── */}
        <section className="relative isolate overflow-hidden">
          <Image
            src={RECEPTION_IMAGE}
            alt="Hotel reception desk with brass service bell"
            fill
            sizes="100vw"
            className="object-cover"
          />
          {/* dark overlay so the headline is readable on top of the photo */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/55 to-black/35" />
          <div className="relative mx-auto max-w-6xl px-6 py-24 lg:py-32">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
                Built for hospitality
              </p>
              <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-tight">
                Built around your day, not a one-size-fits-all template.
              </h2>
              <p className="mt-4 text-base text-white/85 leading-relaxed">
                Every part of {BRAND.name} comes from real workflows hotel
                owners walked us through — the maintenance ticket from
                Room 312, the wedding inquiry, the lobby TV that froze on
                a black screen at 4pm on Saturday. No bloat, no learning
                curve. Just the pieces of your day, in one place.
              </p>
              <div className="mt-8">
                <Link
                  href="/signup"
                  className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-white px-6 text-base font-medium text-slate-900 hover:bg-white/90 transition-colors"
                >
                  Start now
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

function PricingMini() {
  return (
    <Card>
      <CardBody className="space-y-3">
        <Row label="Base" sub="Work Orders, Events, IT Hub, Media, 3 signage screens">
          $100
        </Row>
        <Row label="Signage Unlimited" sub="optional · unlimited screens">
          +$49
        </Row>
        <Row label="Guest Experience" sub="optional · arrival pages + QR cards">
          +$39
        </Row>
        <p className="border-t border-border-subtle pt-3 text-xs text-subtle">
          Per property, per month. Cancel any add-on with one click.
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
