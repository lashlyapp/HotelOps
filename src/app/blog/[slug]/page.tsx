import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Footer } from '@/components/layout/footer'
import { ArticleProse } from '@/components/marketing/article-prose'
import { PublicHeader } from '@/components/marketing/public-header'
import { SharpHeroImage } from '@/components/marketing/sharp-hero-image'
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
    image: meta.heroImage.startsWith('http')
      ? meta.heroImage
      : `https://www.${BRAND.domain}${meta.heroImage}`,
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

  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(meta.title)

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
        <article className="mx-auto max-w-6xl px-6 pt-12 pb-16 lg:pt-16">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-subtle">
            <Link href="/blog" className="hover:text-fg">
              {dict.blog.navLabel}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-muted">{meta.topic}</span>
          </div>

          {/* Two-column layout: article body + sticky sidebar */}
          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-14">
            <div className="min-w-0">
              <header>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-fg leading-[1.1]">
                  {meta.title}
                </h1>
                <p className="mt-6 text-lg text-muted leading-relaxed">
                  {meta.description}
                </p>
              </header>

              <div className="relative mt-10 aspect-[5/2] overflow-hidden rounded-2xl border border-border-subtle bg-surface-muted">
                <SharpHeroImage
                  src={meta.heroImage}
                  alt={meta.heroAlt}
                  priority
                  sizes="(min-width: 1024px) 720px, 100vw"
                />
              </div>

              <div className="mt-10">
                <ArticleProse>
                  <PostBody />
                </ArticleProse>
              </div>
            </div>

            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-2xl border border-border-subtle bg-surface p-6">
                <dl className="space-y-4 text-sm">
                  <div className="flex items-start gap-3">
                    <TagIcon />
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-subtle">
                        Topic
                      </dt>
                      <dd className="mt-0.5 text-fg">{meta.topic}</dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CalendarIcon />
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-subtle">
                        Published
                      </dt>
                      <dd className="mt-0.5 text-fg">
                        <time dateTime={meta.publishedAt}>
                          {formatDate(meta.publishedAt)}
                        </time>
                      </dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <ClockIcon />
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-subtle">
                        Read time
                      </dt>
                      <dd className="mt-0.5 text-fg">
                        {meta.readingMinutes} min read
                      </dd>
                    </div>
                  </div>
                </dl>

                <div className="mt-6 border-t border-border-subtle pt-6">
                  <Link
                    href="/signup"
                    className="focus-ring inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover transition-colors"
                  >
                    {dict.blog.ctaButton}
                  </Link>
                </div>

                <div className="mt-6 border-t border-border-subtle pt-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
                    {dict.blog.share}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <a
                      href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Share on X"
                      className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle text-muted hover:border-border hover:text-fg transition-colors"
                    >
                      <XIcon />
                    </a>
                    <a
                      href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Share on LinkedIn"
                      className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle text-muted hover:border-border hover:text-fg transition-colors"
                    >
                      <LinkedInIcon />
                    </a>
                    <a
                      href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Share on Facebook"
                      className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle text-muted hover:border-border hover:text-fg transition-colors"
                    >
                      <FacebookIcon />
                    </a>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </article>

        <section className="border-t border-border-subtle bg-surface-muted/40">
          <div className="mx-auto max-w-6xl px-6 py-12">
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

function TagIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="mt-0.5 h-4 w-4 shrink-0 text-subtle"
    >
      <path
        d="M3 3h6l8 8-6 6-8-8V3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6.5" cy="6.5" r="1.2" fill="currentColor" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="mt-0.5 h-4 w-4 shrink-0 text-subtle"
    >
      <rect
        x="3"
        y="4.5"
        width="14"
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M3 8.5h14M7 2.5v3M13 2.5v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="mt-0.5 h-4 w-4 shrink-0 text-subtle"
    >
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 6v4l2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function XIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path d="M14.3 2.5h2.6l-5.7 6.5 6.7 8.5h-5.2l-4.1-5.3-4.7 5.3H1.3l6.1-7L1 2.5h5.3l3.7 4.9 4.3-4.9zm-.9 13.4h1.4L6.7 3.9H5.2l8.2 12z" />
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path d="M3.5 7h2.7v9.5H3.5V7zm1.35-4a1.6 1.6 0 110 3.2 1.6 1.6 0 010-3.2zM8 7h2.6v1.3h.04c.36-.68 1.24-1.4 2.56-1.4 2.74 0 3.24 1.8 3.24 4.14V16.5h-2.7v-4.7c0-1.12-.02-2.56-1.56-2.56-1.56 0-1.8 1.22-1.8 2.48v4.78H8V7z" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path d="M11.5 18v-7h2.35l.35-2.7H11.5V6.55c0-.78.22-1.32 1.34-1.32h1.43V2.81C13.96 2.78 13.1 2.7 12.1 2.7c-2.08 0-3.5 1.27-3.5 3.6V8.3H6.25V11H8.6v7h2.9z" />
    </svg>
  )
}
