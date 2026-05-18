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
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-12 lg:pt-24">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              {dict.blog.eyebrow}
            </p>
            <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-fg leading-[1.05]">
              {dict.blog.headline}
            </h1>
            <p className="mt-6 text-lg text-muted leading-relaxed">
              {dict.blog.sub}
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <ul className="grid gap-8 sm:grid-cols-2">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="focus-ring group block overflow-hidden rounded-2xl border border-border-subtle bg-surface transition-colors hover:border-border"
                >
                  <div className="relative aspect-[5/3] overflow-hidden bg-surface-muted">
                    <SharpHeroImage
                      src={post.heroImage}
                      alt={post.heroAlt}
                      sizes="(min-width: 1024px) 480px, (min-width: 640px) 50vw, 100vw"
                      className="transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                    />
                  </div>
                  <div className="space-y-3 p-6">
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
                    <h2 className="text-xl font-semibold tracking-tight text-fg leading-snug">
                      {post.title}
                    </h2>
                    <p className="text-sm text-muted leading-relaxed">
                      {post.description}
                    </p>
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
