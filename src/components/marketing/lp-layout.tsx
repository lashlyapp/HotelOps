import Link from 'next/link'
import Image from 'next/image'
import type { ReactNode } from 'react'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { BRAND } from '@/lib/brand'

/**
 * Shared shell for paid-acquisition landing pages under /lp/<slug>. Every LP
 * has the same shape on purpose: a single primary CTA (Start free trial),
 * no top-nav distraction beyond a wordmark link home, problem framing, then
 * outcome framing, then how-it-works, then FAQ, then a second CTA. The
 * landing page is its own conversion surface — visitors arriving from a
 * search ad should hit a tight, single-path page, not the marketing
 * homepage.
 *
 * UTM params on the inbound URL are captured by the global
 * <UtmCapture/> on the root layout and flow through /signup into the
 * organizations row, so no per-LP attribution wiring is needed here.
 */
export type LpFaqItem = { q: string; a: string }
export type LpStep = { n: string; title: string; body: string }

export type LpContent = {
  slug: string
  metaTitle: string
  metaDescription: string
  eyebrow: string
  heroHeadline: string
  heroSub: string
  /** Public file under /public, e.g. "/AdobeStock_94588323.jpeg". */
  heroImage: string
  heroAlt: string
  /** What's broken today, in 3-4 short stings. */
  problemBullets: string[]
  /** What good looks like, in 3-4 outcome statements. */
  outcomeBullets: { title: string; body: string }[]
  /** Three-step how-it-works. */
  steps: [LpStep, LpStep, LpStep]
  /** 3-5 ad-intent FAQ items. */
  faq: LpFaqItem[]
  /** Anchor on /features to deep-link from "See every feature" link. */
  featuresAnchor: string
}

export function LpPage({ content }: { content: LpContent }) {
  const pageUrl = `https://www.${BRAND.domain}/lp/${content.slug}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: content.metaTitle,
    description: content.metaDescription,
    url: pageUrl,
    inLanguage: 'en',
    isPartOf: {
      '@type': 'WebSite',
      name: BRAND.name,
      url: `https://www.${BRAND.domain}/`,
    },
    mainEntity: {
      '@type': 'FAQPage',
      mainEntity: content.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  }

  return (
    <div className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />

      <header className="border-b border-border-subtle">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Wordmark size="md" href="/" />
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
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Hero content={content} />
        <ProblemBand bullets={content.problemBullets} />
        <OutcomesBand outcomes={content.outcomeBullets} />
        <HowItWorks steps={content.steps} />
        <FaqBand faq={content.faq} />
        <BottomCta featuresAnchor={content.featuresAnchor} />
      </main>

      <Footer variant="public" />
    </div>
  )
}

function Hero({ content }: { content: LpContent }) {
  return (
    <section className="border-b border-border-subtle">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-2 md:items-center md:py-24">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {content.eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
            {content.heroHeadline}
          </h1>
          <p className="mt-5 text-lg text-muted leading-relaxed">
            {content.heroSub}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="focus-ring inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
            >
              Start your free 7-day trial
            </Link>
            <span className="text-sm text-subtle">
              No credit card. 10 GB included.
            </span>
          </div>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border-subtle bg-surface-muted">
          <Image
            src={content.heroImage}
            alt={content.heroAlt}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
            priority
          />
        </div>
      </div>
    </section>
  )
}

function ProblemBand({ bullets }: { bullets: string[] }) {
  return (
    <section className="border-b border-border-subtle bg-surface-muted/40">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          What you’re stuck with today
        </h2>
        <ul className="mt-6 grid gap-4 text-base text-fg sm:grid-cols-2">
          {bullets.map((b) => (
            <li
              key={b}
              className="flex gap-3 rounded-xl border border-border-subtle bg-surface p-5 leading-relaxed"
            >
              <span aria-hidden="true" className="text-muted">
                —
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function OutcomesBand({
  outcomes,
}: {
  outcomes: { title: string; body: string }[]
}) {
  return (
    <section className="border-b border-border-subtle">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          What changes on day one
        </h2>
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          {outcomes.map((o) => (
            <div key={o.title}>
              <h3 className="text-lg font-semibold text-fg">{o.title}</h3>
              <p className="mt-2 text-base text-muted leading-relaxed">
                {o.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks({ steps }: { steps: [LpStep, LpStep, LpStep] }) {
  return (
    <section className="border-b border-border-subtle bg-surface-muted/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl font-semibold tracking-tight text-fg">
          How it works
        </h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {steps.map((step) => (
            <li
              key={step.n}
              className="rounded-2xl border border-border-subtle bg-surface p-6"
            >
              <p className="font-mono text-xs text-subtle">{step.n}</p>
              <h3 className="mt-2 text-base font-semibold text-fg">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function FaqBand({ faq }: { faq: LpFaqItem[] }) {
  return (
    <section className="border-b border-border-subtle">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-3xl font-semibold tracking-tight text-fg">
          Frequently asked questions
        </h2>
        <dl className="mt-8 space-y-8">
          {faq.map((item) => (
            <div key={item.q}>
              <dt className="text-base font-semibold text-fg">{item.q}</dt>
              <dd className="mt-2 text-base text-muted leading-relaxed">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function BottomCta({ featuresAnchor }: { featuresAnchor: string }) {
  return (
    <section className="mx-auto max-w-4xl px-6 py-20 text-center">
      <h2 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
        Try it on your property.
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-base text-muted leading-relaxed">
        Seven days free. No credit card. Full feature access — including the
        modules above and everything else in the stack. If it doesn’t fit,
        export your data and walk away.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/signup"
          className="focus-ring inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
        >
          Start free trial
        </Link>
        <Link
          href={`/features${featuresAnchor}`}
          className="focus-ring inline-flex h-12 items-center justify-center rounded-md border border-border-subtle px-6 text-base font-medium text-fg hover:bg-surface-muted transition-colors"
        >
          See every feature
        </Link>
      </div>
    </section>
  )
}

export function lpMetadata(content: LpContent): {
  title: string
  description: string
  canonical: string
  ogUrl: string
  image: string
} {
  return {
    title: content.metaTitle,
    description: content.metaDescription,
    canonical: `https://www.${BRAND.domain}/lp/${content.slug}`,
    ogUrl: `https://www.${BRAND.domain}/lp/${content.slug}`,
    image: content.heroImage,
  }
}

export function lpRootMetadata(content: LpContent) {
  const m = lpMetadata(content)
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: m.canonical },
    openGraph: {
      type: 'website' as const,
      title: m.title,
      description: m.description,
      url: m.ogUrl,
      siteName: BRAND.name,
    },
    twitter: {
      card: 'summary_large_image' as const,
      title: m.title,
      description: m.description,
    },
  }
}

export type { ReactNode }
