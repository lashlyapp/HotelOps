import Link from 'next/link'
import type { Metadata } from 'next'
import { Footer } from '@/components/layout/footer'
import { PublicHeader } from '@/components/marketing/public-header'
import { SharpHeroImage } from '@/components/marketing/sharp-hero-image'
import { posts } from '@/content/blog'
import { BRAND } from '@/lib/brand'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'

export const metadata: Metadata = {
  title: `Blog — ${BRAND.name}`,
  description:
    'Notes on the state of boutique hotel operations: the underserved tech market, realistic operations budgets, the modernization gap, and what 2026 guests expect.',
  alternates: { canonical: `https://www.${BRAND.domain}/blog` },
  openGraph: {
    type: 'website',
    title: `Blog — ${BRAND.name}`,
    description:
      'The state of boutique hotel operations — underserved tech, real budgets, the modernization gap, and the 2026 guest.',
    url: `https://www.${BRAND.domain}/blog`,
    siteName: BRAND.name,
  },
}

export default async function BlogIndexPage() {
  const locale = await getLocale()
  const dict = getDictionary(locale)

  const [featured, ...rest] = posts

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `https://www.${BRAND.domain}/blog`,
    name: `${BRAND.name} Blog`,
    description:
      'Operational notes for boutique hotel owners, GMs, and operations leads.',
    url: `https://www.${BRAND.domain}/blog`,
    publisher: {
      '@type': 'Organization',
      name: BRAND.legalName,
      url: `https://www.${BRAND.domain}/`,
    },
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      description: p.description,
      datePublished: p.publishedAt,
      url: `https://www.${BRAND.domain}/blog/${p.slug}`,
    })),
  }

  return (
    <div className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />

      <PublicHeader dict={dict} active="blog" />

      <main className="flex-1">
        {/* Hero band — visually distinct banner above the article grid. */}
        <section className="border-b border-border-subtle bg-surface-muted/40">
          <div className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              {dict.blog.eyebrow}
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-fg leading-[1.05]">
              {dict.blog.headline}
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted leading-relaxed">
              {dict.blog.sub}
            </p>
          </div>
        </section>

        {featured ? (
          <section className="mx-auto max-w-6xl px-6 pt-12 lg:pt-16">
            <Link
              href={`/blog/${featured.slug}`}
              className="focus-ring group grid gap-0 overflow-hidden rounded-2xl border border-border-subtle bg-surface transition-colors hover:border-border lg:grid-cols-[1.2fr_1fr]"
            >
              <div className="relative aspect-[5/3] overflow-hidden bg-surface-muted lg:aspect-auto">
                <SharpHeroImage
                  src={featured.heroImage}
                  alt={featured.heroAlt}
                  sizes="(min-width: 1024px) 640px, 100vw"
                  className="transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                />
              </div>
              <div className="flex flex-col gap-4 p-6 lg:p-10">
                <div className="flex items-center gap-3 text-xs text-subtle">
                  <span className="font-semibold uppercase tracking-wider text-fg">
                    {featured.topic}
                  </span>
                  <span aria-hidden>·</span>
                  <time dateTime={featured.publishedAt}>
                    {formatDate(featured.publishedAt)}
                  </time>
                  <span aria-hidden>·</span>
                  <span>{featured.readingMinutes} min read</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-fg leading-snug">
                  {featured.title}
                </h2>
                <p className="text-base text-muted leading-relaxed">
                  {featured.description}
                </p>
                <div className="mt-auto flex justify-end pt-2">
                  <span className="text-sm font-medium text-fg group-hover:underline">
                    Read more →
                  </span>
                </div>
              </div>
            </Link>
          </section>
        ) : null}

        <section className="mx-auto max-w-6xl px-6 pb-24 pt-12 lg:pt-16">
          <ul className="grid auto-rows-fr gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((post) => (
              <li key={post.slug} className="h-full">
                <Link
                  href={`/blog/${post.slug}`}
                  className="focus-ring group flex h-full flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface transition-colors hover:border-border"
                >
                  <div className="relative aspect-[5/3] overflow-hidden bg-surface-muted">
                    <SharpHeroImage
                      src={post.heroImage}
                      alt={post.heroAlt}
                      sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                      className="transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-6">
                    <div className="flex items-center gap-3 text-xs text-subtle">
                      <span className="font-semibold uppercase tracking-wider">
                        {post.topic}
                      </span>
                      <span aria-hidden>·</span>
                      <time dateTime={post.publishedAt}>
                        {formatDate(post.publishedAt)}
                      </time>
                      <span aria-hidden>·</span>
                      <span>{post.readingMinutes} min read</span>
                    </div>
                    <h2 className="line-clamp-3 text-xl font-semibold tracking-tight text-fg leading-snug">
                      {post.title}
                    </h2>
                    <p className="line-clamp-3 text-sm text-muted leading-relaxed">
                      {post.description}
                    </p>
                    <div className="mt-auto flex justify-end pt-3">
                      <span className="text-sm font-medium text-fg group-hover:underline">
                        Read more →
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <Footer variant="public" />
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
