import Link from 'next/link'
import type { Metadata } from 'next'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { Card, CardBody } from '@/components/ui/card'
import { BRAND } from '@/lib/brand'

export const metadata: Metadata = {
  title: `Pricing — ${BRAND.name}`,
  description:
    'Flat per-property pricing for hotel operations software. $100/property/month base with Work Orders, Events, IT Hub, and Media. Optional add-ons for unlimited signage and guest experience.',
  alternates: { canonical: `https://www.${BRAND.domain}/pricing` },
  openGraph: {
    type: 'website',
    title: `Pricing — ${BRAND.name}`,
    description:
      'Hotel operations software with flat per-property pricing. Replace Quore, Yodeck, and Duve under one $188/property/mo cap.',
    url: `https://www.${BRAND.domain}/pricing`,
    siteName: BRAND.name,
  },
}

export default function PricingPage() {
  // Single source of truth: docs/pricing.md. If these numbers change here
  // but not there (or vice versa), one of them is wrong.
  return (
    <div className="flex flex-1 flex-col">
      <PublicHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-12 lg:pt-24 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Pricing
          </p>
          <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-fg leading-[1.05]">
            Per property. Not per seat.
            <br />
            Not per screen. Not per room.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted leading-relaxed">
            One $100/property/month base. Two optional add-ons. That&apos;s
            the whole price list — and the maximum a single property
            can possibly cost you is $188/month, regardless of how many
            screens, rooms, or staff you have.
          </p>
        </section>

        {/* ─── Plan cards ────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-8">
          <div className="grid gap-5 lg:grid-cols-3">
            <PlanCard
              label="Base"
              price="$100"
              cadence="property / month"
              tag="Required"
              tagTone="primary"
              body="Everything every property needs on day one — maintenance work orders, event proposals, IT records, media library, and 3 signage screens."
              features={[
                'Work Orders (Kanban with photo/video evidence)',
                'Events (inquiry → proposal → invoice)',
                'IT Hub (Wi-Fi, vendor logins, equipment)',
                'Media catalog with global CDN',
                '3 signage screens included',
                'Unlimited team members',
              ]}
            />
            <PlanCard
              label="Signage Unlimited"
              price="+$49"
              cadence="property / month"
              tag="Optional"
              body="Lifts the 3-screen cap. Unlimited TVs at every property — lobby, breakroom, meeting rooms, pool deck. Same scheduler, same emergency broadcast."
              features={[
                'Unlimited screens per property',
                'Per-property emergency takeover',
                'Date + time-of-day scheduling',
                'Pair any browser-capable TV',
                'Image, video, web, or branded text card',
                'Activated org-wide with one click',
              ]}
            />
            <PlanCard
              label="Guest Experience"
              price="+$39"
              cadence="property / month"
              tag="Optional"
              body="Branded arrival page, printable QR card for each room, and guest issue intake. Replaces $3–$6 per occupied room concierge tools at flat-rate."
              features={[
                'Arrival page builder with brand color',
                'Wi-Fi auto-imported from IT Hub',
                'Restaurant + room service menus',
                'Letter / A4 printable QR card',
                'No guest account, no app',
                'Activated org-wide with one click',
              ]}
            />
          </div>
          <p className="mt-6 text-center text-xs text-subtle">
            Mid-cycle add-on changes are prorated and invoiced immediately
            so each property&apos;s billing timeline stays clean.
          </p>
        </section>

        {/* ─── Comparison table (SEO + sales weapon) ─────────────────── */}
        <section className="border-y border-border-subtle bg-surface-muted/40 scroll-mt-20" id="compare">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                The math
              </p>
              <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
                For a 40-room boutique buying these tools today.
              </h2>
              <p className="mt-4 text-base text-muted leading-relaxed">
                Hotels typically run a maintenance ticketing tool, a digital
                signage subscription, and a guest concierge / arrival
                platform — each on a different per-screen, per-room, or
                per-property billing axis. Here&apos;s what one property
                pays for all three à la carte versus through {BRAND.name}.
              </p>
            </div>

            <div className="mt-10 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-subtle">
                  <tr>
                    <th className="px-4 py-3 font-medium">Need</th>
                    <th className="px-4 py-3 font-medium">Standalone tool</th>
                    <th className="px-4 py-3 font-medium text-right">
                      Standalone cost
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      With {BRAND.name}
                    </th>
                  </tr>
                </thead>
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
                    <td className="px-4 py-3 text-fg">Monthly total</td>
                    <td className="px-4 py-3 text-muted">à la carte</td>
                    <td className="px-4 py-3 text-right text-fg tabular-nums">
                      ~$580
                    </td>
                    <td className="px-4 py-3 text-right text-fg tabular-nums">
                      $188
                    </td>
                  </tr>
                  <tr className="bg-success-bg/30 font-semibold">
                    <td className="px-4 py-3 text-fg" colSpan={2}>
                      Savings vs. standalone à la carte
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
              Standalone prices are publicly listed entry tiers as of
              May 2026; some vendors only quote on request and may be
              higher in practice. Guest-arrival vendors charge per
              occupied room, so the figure above assumes a 40-room
              property at typical mid-tier occupancy.
            </p>
          </div>
        </section>

        {/* ─── Scaling by property count ─────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
              What multi-property groups actually pay.
            </h2>
            <p className="mt-4 text-base text-muted leading-relaxed">
              Add-ons activate org-wide and bill on every property&apos;s
              invoice. A four-property group with both add-ons on pays
              4 × $188 = $752/month — all in.
            </p>
          </div>

          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-4 py-3 font-medium">Properties</th>
                  <th className="px-4 py-3 font-medium text-right">
                    Base only
                  </th>
                  <th className="px-4 py-3 font-medium text-right">
                    Base + Signage
                  </th>
                  <th className="px-4 py-3 font-medium text-right">
                    Everything on
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                <ScaleRow count={1} />
                <ScaleRow count={3} />
                <ScaleRow count={5} />
                <ScaleRow count={10} />
                <ScaleRow count={25} />
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── FAQ (SEO long-tail) ───────────────────────────────────── */}
        <section className="border-t border-border-subtle bg-surface-muted/40">
          <div className="mx-auto max-w-3xl px-6 py-20">
            <h2 className="text-3xl font-semibold tracking-tight text-fg">
              Common questions
            </h2>
            <div className="mt-8 space-y-6">
              <Faq
                q="Is there a setup or onboarding fee?"
                a="One-time per tenant when you start with us — we apply it on the first property's first invoice and never re-charge if you add more properties or resubscribe. We onboard your team personally; no DIY wizard."
              />
              <Faq
                q="What happens to my data if I cancel?"
                a="You keep access to your media library and IT Hub records for 30 days, with an export option on day one. After 30 days your account is closed and storage is reclaimed."
              />
              <Faq
                q="Do you charge per user or per seat?"
                a="No. Every staff member at every property is included — front desk, housekeeping, engineering, ownership. Per-property pricing is the only axis."
              />
              <Faq
                q="What if I only want maintenance, or only signage?"
                a="You can. The base subscription includes maintenance work orders, events, IT Hub, media, and three signage screens at $100/property. Add Signage Unlimited or Guest Experience only if you want them — toggle on /billing, billed prorated."
              />
              <Faq
                q="How is the signage add-on different from Yodeck or OptiSigns?"
                a="Flat per-property pricing — unlimited screens at a property for $49 versus $8–$30 per screen per month elsewhere. Same player concept (any browser-capable TV), same scheduling. Break-even versus Yodeck at about 6 screens; cheaper above that."
              />
              <Faq
                q="Do you integrate with our PMS (Mews, Cloudbeds, Opera)?"
                a="Not yet. The current product runs alongside whatever PMS you use; PMS adapters (reservation import for arrival personalization, etc.) are on the roadmap."
              />
            </div>
          </div>
        </section>

        {/* ─── CTA ───────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
            Start with the base. Add the rest only if you need it.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted leading-relaxed">
            Sign up takes a minute. We&apos;ll be in touch to onboard
            you and your team personally so you&apos;re running on
            day one.
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
            >
              Sign up
            </Link>
          </div>
        </section>
      </main>

      <Footer variant="public" />
    </div>
  )
}

function PublicHeader() {
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
            className="focus-ring rounded-md px-3 py-1.5 font-medium text-fg"
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
  features: string[]
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

function ScaleRow({ count }: { count: number }) {
  const base = 100 * count
  const signage = base + 49 * count
  const all = base + 49 * count + 39 * count
  return (
    <tr>
      <td className="px-4 py-3 font-medium text-fg">
        {count} {count === 1 ? 'property' : 'properties'}
      </td>
      <td className="px-4 py-3 text-right text-muted tabular-nums">
        ${base}/mo
      </td>
      <td className="px-4 py-3 text-right text-muted tabular-nums">
        ${signage}/mo
      </td>
      <td className="px-4 py-3 text-right text-fg tabular-nums">
        ${all}/mo
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
