import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardBody } from '@/components/ui/card'
import { requireSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { cn } from '@/lib/utils/cn'
import { generatePost } from './_lib/generator'
import { PostCard } from './_components/post-card'
import { RecentTimeline } from './_components/recent-timeline'
import type { SocialCaptionFeedback, SocialPostLog } from '@/lib/supabase/types'

type SearchParams = Promise<{ property?: string; attempt?: string }>

export default async function SocialPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await requireSession()
  const { property: propertySlug, attempt: attemptRaw } = await searchParams

  if (session.properties.length === 0) {
    return (
      <div className="p-4 sm:p-8 max-w-3xl">
        <PageHeader title="Social posts" />
        <p className="mt-4 text-sm text-muted">
          No properties yet. Contact your admin to add one.
        </p>
      </div>
    )
  }

  const activeProperty =
    session.properties.find((p) => p.slug === propertySlug) ??
    session.properties[0]

  if (propertySlug !== activeProperty.slug) {
    redirect(`/social?property=${activeProperty.slug}`)
  }

  const attempt = Math.max(0, Math.min(99, Number.parseInt(attemptRaw ?? '0', 10) || 0))

  // Use UTC date — we don't store property timezones yet, and the
  // rotation only needs to advance once a day. Good enough for v1.
  const today = new Date().toISOString().slice(0, 10)

  const [post, history, feedbackByCaption] = await Promise.all([
    generatePost({
      property: activeProperty,
      orgName: session.organization.name,
      today,
      attempt,
    }),
    loadRecentPosts(activeProperty.id),
    loadFeedbackForCaptions(activeProperty.id),
  ])

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <PageHeader
        title="Social posts"
        subtitle="A post a day, ready to publish. Pick a caption, grab the image, paste it into your hotel's social — we don't touch the platforms ourselves."
      />

      <PropertyTabs
        properties={session.properties.map((p) => ({
          slug: p.slug,
          name: p.name,
          active: p.slug === activeProperty.slug,
        }))}
      />

      {!post.settings || !post.settings.openai_api_key_enc ? (
        <Card>
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-fg">
                {post.usedAi ? 'AI is on for this property' : 'Add your OpenAI key for richer captions'}
              </h3>
              <p className="mt-1 text-sm text-muted">
                Without a key, the app uses templated captions with placeholders. With a key, captions adapt to your brand voice and learn from your thumbs-up/down feedback.
              </p>
            </div>
            <Link
              href={`/social/settings?property=${activeProperty.slug}`}
              className="focus-ring inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-border-default bg-surface px-4 text-sm font-medium text-fg hover:bg-surface-muted"
            >
              Open settings
            </Link>
          </CardBody>
        </Card>
      ) : null}

      <PostCard
        propertyId={activeProperty.id}
        propertyName={activeProperty.name}
        propertySlug={activeProperty.slug}
        today={today}
        attempt={attempt}
        topicKey={post.topic.key}
        topicLabel={post.topic.label}
        topicHint={post.topic.hint}
        captions={post.captions}
        hashtagSets={post.hashtagSets}
        media={
          post.media
            ? {
                key: post.media.key,
                url: post.media.url,
                displayName: post.media.displayName,
              }
            : null
        }
        weatherPhrase={post.weather.phrase}
        usedAi={post.usedAi}
        signatureHashtags={post.settings?.signature_hashtags ?? null}
        socialHandle={post.settings?.social_handles ?? null}
        feedbackByCaption={feedbackByCaption}
      />

      <RecentTimeline rows={history} />
    </div>
  )
}

async function loadRecentPosts(propertyId: string): Promise<SocialPostLog[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('social_post_log')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
    .limit(7)
  return ((data as SocialPostLog[] | null) ?? []).map((row) => ({
    ...row,
    captions: Array.isArray(row.captions) ? row.captions : [],
  }))
}

async function loadFeedbackForCaptions(
  propertyId: string,
): Promise<Record<string, 'like' | 'dislike'>> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('social_caption_feedback')
    .select('caption, liked')
    .eq('property_id', propertyId)
    .order('updated_at', { ascending: false })
    .limit(200)

  const map: Record<string, 'like' | 'dislike'> = {}
  for (const row of (data as Pick<SocialCaptionFeedback, 'caption' | 'liked'>[]) ?? []) {
    map[row.caption] = row.liked ? 'like' : 'dislike'
  }
  return map
}

function PropertyTabs({
  properties,
}: {
  properties: { slug: string; name: string; active: boolean }[]
}) {
  if (properties.length <= 1) return null
  return (
    <div className="flex flex-wrap gap-1 border-b border-border-subtle">
      {properties.map((p) => (
        <Link
          key={p.slug}
          href={`/social?property=${p.slug}`}
          className={cn(
            'focus-ring -mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            p.active
              ? 'border-fg text-fg'
              : 'border-transparent text-muted hover:text-fg',
          )}
        >
          {p.name}
        </Link>
      ))}
    </div>
  )
}

function PageHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted max-w-2xl">{subtitle}</p>
        ) : null}
      </div>
    </div>
  )
}
