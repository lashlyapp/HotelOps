import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardBody } from '@/components/ui/card'
import { requireSession } from '@/lib/auth/session'
import { hasAddon } from '@/lib/billing/has-addon'
import { r2PublicUrl } from '@/lib/r2/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { cn } from '@/lib/utils/cn'
import { PaywallPreview } from './_components/paywall-preview'
import { PostCard } from './_components/post-card'
import { RecentTimeline } from './_components/recent-timeline'
import { SAMPLE_POST } from './_lib/sample-post'
import { TOPICS, type TopicKey } from './_lib/topics'
import type {
  PropertySocialSettings,
  SocialCaptionFeedback,
  SocialPostLog,
} from '@/lib/supabase/types'

type SearchParams = Promise<{ property?: string }>

export default async function SocialPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await requireSession()
  const { property: propertySlug } = await searchParams

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

  // Paywall path: org doesn't have the add-on. Show the static sample
  // post so the operator sees exactly what they're buying, plus a
  // direct CTA to Billing where they can enable it.
  if (!hasAddon(session.organization, 'social_studio')) {
    return (
      <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
        <PageHeader
          title="Social Studio"
          subtitle="One AI-drafted post per property, every morning — captions, hashtags, and a photo pick from your media library. Built for GMs without a marketing team."
        />
        <PropertyTabsBar
          properties={session.properties.map((p) => ({
            slug: p.slug,
            name: p.name,
            active: p.slug === activeProperty.slug,
          }))}
        />
        <PaywallPreview
          sample={SAMPLE_POST}
          propertyName={activeProperty.name}
          propertyCount={session.properties.length}
        />
      </div>
    )
  }

  // Add-on active — read today's generated post and recent history.
  const today = new Date().toISOString().slice(0, 10)
  const admin = createAdminClient()

  const [
    { data: todayRow },
    { data: settings },
    historyRows,
    feedbackByCaption,
  ] = await Promise.all([
    admin
      .from('social_post_log')
      .select('*')
      .eq('property_id', activeProperty.id)
      .eq('post_date', today)
      .maybeSingle(),
    admin
      .from('property_social_settings')
      .select('*')
      .eq('property_id', activeProperty.id)
      .maybeSingle(),
    loadRecentPosts(activeProperty.id),
    loadFeedbackForCaptions(activeProperty.id),
  ])

  const typedSettings = (settings as PropertySocialSettings | null) ?? null
  const todayPost = (todayRow as SocialPostLog | null) ?? null

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <PageHeader
        title="Social posts"
        subtitle="A post a day, ready to publish. Pick a caption, grab the image, paste it into your hotel's social — we never touch the platforms ourselves."
      />

      <PropertyTabsBar
        properties={session.properties.map((p) => ({
          slug: p.slug,
          name: p.name,
          active: p.slug === activeProperty.slug,
        }))}
      />

      {todayPost ? (
        <PostCard
          propertyId={activeProperty.id}
          propertyName={activeProperty.name}
          postDate={todayPost.post_date}
          topicKey={todayPost.topic}
          topicLabel={TOPICS[todayPost.topic as TopicKey]?.label ?? todayPost.topic}
          topicHint={TOPICS[todayPost.topic as TopicKey]?.hint ?? ''}
          captions={todayPost.captions}
          hashtagSets={todayPost.hashtag_sets ?? []}
          media={resolvePostMedia(todayPost)}
          markedUsed={Boolean(todayPost.marked_used_at)}
          signatureHashtags={typedSettings?.signature_hashtags ?? null}
          socialHandle={typedSettings?.social_handles ?? null}
          feedbackByCaption={feedbackByCaption}
        />
      ) : (
        <Card>
          <CardBody className="space-y-2">
            <h3 className="text-sm font-semibold text-fg">
              Today&apos;s post is on the way
            </h3>
            <p className="text-sm text-muted">
              Social Studio drafts one post per property every morning. Check back shortly — or come back tomorrow at 6am local for fresh material.
            </p>
            <p className="text-xs text-subtle">
              Tip: while you wait, set your{' '}
              <Link
                href={`/social/settings?property=${activeProperty.slug}`}
                className="focus-ring text-fg underline-offset-2 hover:underline"
              >
                brand voice and signature hashtags
              </Link>{' '}
              so tomorrow&apos;s draft already sounds like you.
            </p>
          </CardBody>
        </Card>
      )}

      <RecentTimeline rows={historyRows} />
    </div>
  )
}

async function loadRecentPosts(propertyId: string): Promise<SocialPostLog[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('social_post_log')
    .select('*')
    .eq('property_id', propertyId)
    .order('post_date', { ascending: false })
    .limit(7)
  return ((data as SocialPostLog[] | null) ?? []).map((row) => ({
    ...row,
    captions: Array.isArray(row.captions) ? row.captions : [],
    hashtag_sets: Array.isArray(row.hashtag_sets) ? row.hashtag_sets : [],
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

function deriveDisplayName(key: string): string {
  const last = key.split('/').pop() ?? key
  return last
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
}

// Translate the persisted row into the shape PostCard wants. The two
// kinds of media are mutually exclusive at the DB level; this helper
// makes the discriminated union the UI consumes.
function resolvePostMedia(row: SocialPostLog): import('./_components/post-card').PostCardProps['media'] {
  if (row.external_media_url && row.external_media_credit) {
    return {
      source: 'unsplash',
      url: row.external_media_url,
      credit: row.external_media_credit,
    }
  }
  if (row.media_key) {
    return {
      source: 'catalog',
      key: row.media_key,
      url: r2PublicUrl(row.media_key),
      displayName: deriveDisplayName(row.media_key),
    }
  }
  return null
}

function PropertyTabsBar({
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
