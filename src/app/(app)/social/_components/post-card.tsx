'use client'

import { useActionState, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'
import {
  emailPostAction,
  markPostUsedAction,
  voteCaptionAction,
  type ActionResult,
} from '../actions'
import { PlatformPreview } from './platform-preview'

const initialResult: ActionResult = {}

// Two photo sources: the property's own catalog (an R2 key + URL) or
// an externally hosted image with attribution (Unsplash today, but the
// shape is source-agnostic). The union keeps the catalog-only path
// type-safe — the credit fields are only present on the external
// variant.
export type Media =
  | { source: 'catalog'; key: string; url: string; displayName: string }
  | {
      source: 'unsplash'
      url: string
      credit: {
        source: 'unsplash'
        photographer_name: string
        photographer_url: string
        source_url: string
      }
    }

export type PostCardProps = {
  propertyId: string
  propertyName: string
  postDate: string
  topicKey: string
  topicLabel: string
  topicHint: string
  captions: string[]
  // Parallel to captions: AI-suggested hashtags per variant.
  hashtagSets: string[][]
  media: Media | null
  markedUsed: boolean
  signatureHashtags: string | null
  socialHandle: string | null
  // caption text → 'like' | 'dislike'. Server-rendered so the buttons
  // start in the correct state without a roundtrip.
  feedbackByCaption: Record<string, 'like' | 'dislike'>
}

export function PostCard(props: PostCardProps) {
  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-subtle">
              Today&apos;s angle
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-fg">
              {props.topicLabel}
            </h2>
            <p className="mt-1 text-sm text-muted max-w-xl">{props.topicHint}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-subtle">
              <span>{props.postDate}</span>
              {props.markedUsed ? (
                <span className="inline-flex items-center rounded-sm bg-success-bg px-1.5 py-0.5 text-[10px] font-medium text-success-fg">
                  Posted
                </span>
              ) : null}
            </p>
          </div>
        </div>

        <PlatformPreview
          captions={props.captions}
          hashtagSets={props.hashtagSets}
          signatureHashtags={props.signatureHashtags}
          socialHandle={props.socialHandle}
          propertyName={props.propertyName}
          mediaUrl={props.media?.url ?? null}
        />

        {props.media ? <MediaPreview media={props.media} /> : null}

        <div className="space-y-3">
          {props.captions.map((caption, i) => (
            <CaptionRow
              key={`${i}-${caption}`}
              caption={caption}
              index={i}
              aiHashtags={props.hashtagSets[i] ?? []}
              propertyId={props.propertyId}
              topicKey={props.topicKey}
              signatureHashtags={props.signatureHashtags}
              initialVote={props.feedbackByCaption[caption] ?? null}
            />
          ))}
        </div>

        <PostActions
          propertyId={props.propertyId}
          propertyName={props.propertyName}
          postDate={props.postDate}
          captions={props.captions}
          hashtagSets={props.hashtagSets}
          mediaUrl={props.media?.url ?? null}
          signatureHashtags={props.signatureHashtags}
          alreadyMarked={props.markedUsed}
        />
      </CardBody>
    </Card>
  )
}

function MediaPreview({ media }: { media: Media }) {
  const alt =
    media.source === 'catalog'
      ? media.displayName
      : media.credit.photographer_name
        ? `Photo by ${media.credit.photographer_name}`
        : 'Suggested photo'
  return (
    <div className="overflow-hidden rounded-md border border-border-subtle">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={media.url}
        alt={alt}
        className="w-full max-h-80 object-cover"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle bg-surface-muted px-3 py-2">
        {media.source === 'catalog' ? (
          <span className="truncate text-xs text-muted">{media.displayName}</span>
        ) : (
          <span className="truncate text-xs text-muted">
            Photo by{' '}
            <a
              href={media.credit.photographer_url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-fg underline-offset-2 hover:underline"
            >
              {media.credit.photographer_name}
            </a>{' '}
            on{' '}
            <a
              href={media.credit.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-fg underline-offset-2 hover:underline"
            >
              Unsplash
            </a>
          </span>
        )}
        <a
          href={media.url}
          download
          target={media.source === 'unsplash' ? '_blank' : undefined}
          rel={media.source === 'unsplash' ? 'noreferrer noopener' : undefined}
          className="focus-ring text-xs font-medium text-fg underline-offset-2 hover:underline"
        >
          Download
        </a>
      </div>
    </div>
  )
}

function CaptionRow({
  caption,
  index,
  aiHashtags,
  propertyId,
  topicKey,
  signatureHashtags,
  initialVote,
}: {
  caption: string
  index: number
  aiHashtags: string[]
  propertyId: string
  topicKey: string
  signatureHashtags: string | null
  initialVote: 'like' | 'dislike' | null
}) {
  const [copied, setCopied] = useState(false)
  const fullCaption = composeFull(caption, aiHashtags, signatureHashtags)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fullCaption)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch (err) {
      console.warn('clipboard failed', err)
    }
  }

  return (
    <div className="rounded-md border border-border-subtle bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-subtle">
            Variant {index + 1}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{caption}</p>
          {aiHashtags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {aiHashtags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-sm bg-surface-muted px-1.5 py-0.5 text-xs text-fg"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {signatureHashtags ? (
            <p className="mt-2 text-xs text-subtle">{signatureHashtags}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-border-default bg-surface px-2.5 text-xs font-medium text-fg hover:bg-surface-muted"
        >
          {copied ? <Check /> : <Clipboard />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="mt-2.5 flex items-center justify-between border-t border-border-subtle pt-2.5">
        <span className="text-xs text-subtle">Was this on-brand?</span>
        <VoteButtons
          propertyId={propertyId}
          caption={caption}
          topicKey={topicKey}
          initialVote={initialVote}
        />
      </div>
    </div>
  )
}

function composeFull(
  caption: string,
  aiHashtags: string[],
  signatureHashtags: string | null,
): string {
  const lines = [caption]
  const tags = [...aiHashtags]
  if (signatureHashtags) {
    for (const t of signatureHashtags.split(/\s+/)) {
      const trimmed = t.trim()
      if (trimmed && !tags.includes(trimmed)) tags.push(trimmed)
    }
  }
  if (tags.length > 0) lines.push('', tags.join(' '))
  return lines.join('\n')
}

function VoteButtons({
  propertyId,
  caption,
  topicKey,
  initialVote,
}: {
  propertyId: string
  caption: string
  topicKey: string
  initialVote: 'like' | 'dislike' | null
}) {
  const [vote, setVote] = useState<'like' | 'dislike' | null>(initialVote)
  const [pending, startTransition] = useTransition()

  function cast(next: 'like' | 'dislike') {
    const target = vote === next ? 'clear' : next
    // Optimistic update — the server action only revalidates `/social`,
    // so without this the buttons would feel laggy.
    setVote(target === 'clear' ? null : next)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('property_id', propertyId)
      fd.set('caption', caption)
      fd.set('topic', topicKey)
      fd.set('vote', target)
      await voteCaptionAction(fd)
    })
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => cast('like')}
        disabled={pending}
        aria-pressed={vote === 'like'}
        aria-label="Like this caption"
        className={cn(
          'focus-ring inline-flex h-8 w-8 items-center justify-center rounded-sm border text-fg transition-colors',
          vote === 'like'
            ? 'border-fg bg-fg text-surface'
            : 'border-border-default bg-surface hover:bg-surface-muted',
        )}
      >
        <ThumbsUp />
      </button>
      <button
        type="button"
        onClick={() => cast('dislike')}
        disabled={pending}
        aria-pressed={vote === 'dislike'}
        aria-label="Dislike this caption"
        className={cn(
          'focus-ring inline-flex h-8 w-8 items-center justify-center rounded-sm border text-fg transition-colors',
          vote === 'dislike'
            ? 'border-fg bg-fg text-surface'
            : 'border-border-default bg-surface hover:bg-surface-muted',
        )}
      >
        <ThumbsDown />
      </button>
    </div>
  )
}

function PostActions({
  propertyId,
  propertyName,
  postDate,
  captions,
  hashtagSets,
  mediaUrl,
  signatureHashtags,
  alreadyMarked,
}: {
  propertyId: string
  propertyName: string
  postDate: string
  captions: string[]
  hashtagSets: string[][]
  mediaUrl: string | null
  signatureHashtags: string | null
  alreadyMarked: boolean
}) {
  const [emailState, emailAction, emailPending] = useActionState(
    emailPostAction,
    initialResult,
  )
  const [markedPending, startMark] = useTransition()
  const [marked, setMarked] = useState(alreadyMarked)

  // We email the longest caption — it's the one most likely to be
  // posted, and the GM can trim from there. Pair it with that
  // variant's AI hashtags + the property's signature set.
  const preferredIdx = pickLongestIndex(captions)
  const fullCaption = composeFull(
    captions[preferredIdx] ?? '',
    hashtagSets[preferredIdx] ?? [],
    signatureHashtags,
  )

  function handleMarkUsed() {
    setMarked(true)
    startMark(async () => {
      const fd = new FormData()
      fd.set('property_id', propertyId)
      fd.set('post_date', postDate)
      await markPostUsedAction(fd)
    })
  }

  return (
    <div className="space-y-3 border-t border-border-subtle pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <form action={emailAction}>
          <input type="hidden" name="caption" value={fullCaption} />
          <input type="hidden" name="property_name" value={propertyName} />
          {mediaUrl ? (
            <input type="hidden" name="image_url" value={mediaUrl} />
          ) : null}
          <Button type="submit" variant="primary" disabled={emailPending}>
            {emailPending ? 'Sending…' : 'Email this post to me'}
          </Button>
        </form>
        <Button
          type="button"
          variant="secondary"
          disabled={markedPending || marked}
          onClick={handleMarkUsed}
        >
          {marked ? 'Logged' : 'Mark as posted'}
        </Button>
      </div>
      {emailState.error ? (
        <p className="text-sm text-danger-fg">{emailState.error}</p>
      ) : null}
      {emailState.success ? (
        <p className="text-sm text-success-fg">{emailState.success}</p>
      ) : null}
    </div>
  )
}

function pickLongestIndex(captions: string[]): number {
  let best = 0
  for (let i = 1; i < captions.length; i++) {
    if (captions[i].length > captions[best].length) best = i
  }
  return best
}

// ---------------------------------------------------------------------------
// Inline icons — kept here so this feature doesn't add a deps dance.
// ---------------------------------------------------------------------------
function ThumbsUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M3.75 8.75v7.5h2.5v-7.5h-2.5Zm5 7.5h6.038c.66 0 1.247-.43 1.452-1.063l1.604-4.937A1.527 1.527 0 0 0 16.288 8.25H11.5l.74-3.572a.781.781 0 0 0-.27-.78L11 3.25l-4.25 4.5v8.5h2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ThumbsDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M16.25 11.25v-7.5h-2.5v7.5h2.5Zm-5-7.5H5.212a1.527 1.527 0 0 0-1.452 1.063L2.156 9.75a1.527 1.527 0 0 0 1.456 1.99H8.5l-.74 3.573a.781.781 0 0 0 .27.78l.97.647 4.25-4.5v-8.5h-2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Clipboard() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M7 4.5h6m-7 0v11.25c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V4.5m-9 0V3.25c0-.69.56-1.25 1.25-1.25h6.5c.69 0 1.25.56 1.25 1.25V4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M4 10.5l3.5 3.5L16 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

