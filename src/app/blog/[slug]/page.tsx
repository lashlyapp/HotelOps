import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { ArticleProse } from '@/components/marketing/article-prose'
import { getAllSlugs, getPost, posts } from '@/content/blog'
import { BRAND } from '@/lib/brand'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getLocale } from '@/lib/i18n/get-locale'

type Params = Promise<{ slug: string }>

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Params
}): Promise<Metadata> {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) return {}
  const url = `https://www.${BRAND.domain}/blog/${post.meta.slug}`
  return {
    title: `${post.meta.title} — ${BRAND.name}`,
    description: post.meta.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title: post.meta.title,
      description: post.meta.description,
      url,
      siteName: BRAND.name,
      publishedTime: post.meta.publishedAt,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.meta.title,
      description: post.meta.description,
    },
  }
}

export default async function BlogPostPage({ params }: { params: Params }) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()

  const locale = await getLocale()
  const dict = getDictionary(locale)
  const { meta } = post
  const PostBody = post.default
  const url = `https://www.${BRAND.domain}/blog/${meta.slug}`

  const related = posts.filter((p) => p.slug !== meta.slug).slice(0, 2)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': url,
    headline: meta.title,
    description: meta.description,
    datePublished: meta.publishedAt,
    image: `https://www.${BRAND.domain}${meta.heroImage}`,
    author: {
      '@type': 'Organization',
      name: BRAND.legalName,
      url: `https://www.${BRAND.domain}/`,
    },
    publisher: {
      '@type': 'Organization',
      name: BRAND.legalName,
      url: `https://www.${BRAND.domain}/`,
      logo: {
        '@type': 'ImageObject',
        url: `https://www.${BRAND.domain}/HotelOps.png`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
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
              href="/blog"
              className="focus-ring rounded-md px-3 py-1.5 font-medium text-fg"
            >
              {dict.blog.navLabel}
            </Link>
            <Link
              href="/about"
              className="focus-ring rounded-md px-3 py-1.5 text-muted hover:text-fg"
            >
              {dict.about.navLabel}
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
        <article>
          <header className="mx-auto max-w-3xl px-6 pt-12 pb-8 lg:pt-20">
            <div className="flex items-center gap-3 text-xs text-subtle">
              <Link
                href="/blog"
                className="font-semibold uppercase tracking-wider hover:text-fg"
              >
                {dict.blog.navLabel}
              </Link>
              <span aria-hidden>·</span>
              <span className="font-semibold uppercase tracking-wider">
                {meta.topic}
              </span>
              <span aria-hidden>·</span>
              <time dateTime={meta.publishedAt}>
                {formatDate(meta.publishedAt)}
              </time>
              <span aria-hidden>·</span>
              <span>{meta.readingMinutes} min read</span>
            </div>
            <h1 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-fg leading-[1.1]">
              {meta.title}
            </h1>
            <p className="mt-6 text-lg text-muted leading-relaxed">
              {meta.description}
            </p>
          </header>

          <div className="mx-auto max-w-5xl px-6">
            <div className="relative aspect-[5/2] overflow-hidden rounded-2xl border border-border-subtle bg-surface-muted">
              <Image
                src={meta.heroImage}
                alt={meta.heroAlt}
                fill
                priority
                quality={95}
                sizes="(min-width: 1024px) 960px, 100vw"
                className="object-cover"
              />
            </div>
          </div>

          <section className="mx-auto max-w-3xl px-6 py-12 lg:py-16">
            <ArticleProse>
              <PostBody />
            </ArticleProse>
          </section>
        </article>

        <section className="border-t border-border-subtle bg-surface-muted/40">
          <div className="mx-auto max-w-3xl px-6 py-12">
            <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
              {dict.blog.relatedHeading}
            </p>
            <ul className="mt-4 space-y-4">
              {related.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/blog/${p.slug}`}
                    className="focus-ring block rounded-md"
                  >
                    <p className="text-base font-semibold text-fg hover:underline">
                      {p.title}
                    </p>
                    <p className="mt-1 text-sm text-muted leading-relaxed">
                      {p.description}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
            {dict.blog.ctaHeadline}
          </h2>
          <p className="mx-auto mt-3 text-base text-muted leading-relaxed">
            {dict.blog.ctaSub}
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-fg hover:bg-primary-hover transition-colors"
            >
              {dict.blog.ctaButton}
            </Link>
          </div>
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
