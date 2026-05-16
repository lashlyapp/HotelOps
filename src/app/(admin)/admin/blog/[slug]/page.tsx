import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { ArticleProse } from '@/components/marketing/article-prose'
import { getPostIncludingScheduled } from '@/content/blog'
import { BRAND } from '@/lib/brand'
import { requirePlatformAdmin } from '@/lib/auth/session'

type Params = Promise<{ slug: string }>

/**
 * Admin preview of a single blog post, scheduled or live. Renders
 * the same body component the public detail page renders, inside
 * the admin shell so the platform admin can review a draft before
 * its publishedAt date. The public page would 404 on a scheduled
 * post; this one does not because it uses
 * getPostIncludingScheduled.
 */
export default async function AdminBlogPreviewPage({
  params,
}: {
  params: Params
}) {
  await requirePlatformAdmin()
  const { slug } = await params
  const post = getPostIncludingScheduled(slug)
  if (!post) notFound()

  const todayIso = new Date().toISOString().slice(0, 10)
  const isLive = post.meta.publishedAt <= todayIso
  const PostBody = post.default

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      <div>
        <Link
          href="/admin/blog"
          className="text-xs font-semibold uppercase tracking-wider text-subtle hover:text-fg"
        >
          ← Blog queue
        </Link>
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {isLive ? (
            <Badge tone="success">Live</Badge>
          ) : post.meta.publishedAt === todayIso ? (
            <Badge tone="warning">Publishing today</Badge>
          ) : (
            <Badge tone="info">Scheduled</Badge>
          )}
          <span className="text-xs text-subtle">
            <span className="font-mono text-fg">
              {post.meta.publishedAt}
            </span>{' '}
            · {post.meta.topic} · {post.meta.readingMinutes} min read
          </span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-fg leading-tight">
          {post.meta.title}
        </h1>

        <p className="text-sm text-muted leading-relaxed">
          {post.meta.description}
        </p>

        <dl className="grid gap-3 sm:grid-cols-2 pt-2 text-xs">
          <div>
            <dt className="font-semibold uppercase tracking-wider text-subtle">
              Slug
            </dt>
            <dd className="mt-0.5">
              <code className="text-fg">{post.meta.slug}</code>
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wider text-subtle">
              Public URL
            </dt>
            <dd className="mt-0.5">
              {isLive ? (
                <a
                  href={`/blog/${post.meta.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-fg hover:underline"
                >
                  /blog/{post.meta.slug} ↗
                </a>
              ) : (
                <span className="text-subtle">
                  not yet (404 until {post.meta.publishedAt})
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wider text-subtle">
              Source file
            </dt>
            <dd className="mt-0.5">
              <code className="text-fg">
                src/content/blog/posts/{post.meta.slug}.tsx
              </code>
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wider text-subtle">
              Canonical
            </dt>
            <dd className="mt-0.5 break-all text-subtle">
              https://www.{BRAND.domain}/blog/{post.meta.slug}
            </dd>
          </div>
        </dl>
      </div>

      <div className="relative aspect-[5/2] overflow-hidden rounded-2xl border border-border-subtle bg-surface-muted">
        <Image
          src={post.meta.heroImage}
          alt={post.meta.heroAlt}
          fill
          sizes="(min-width: 1024px) 800px, 100vw"
          className="object-cover"
        />
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface p-8">
        <ArticleProse>
          <PostBody />
        </ArticleProse>
      </div>
    </div>
  )
}
