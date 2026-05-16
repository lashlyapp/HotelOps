'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils/cn'

export type Platform = 'instagram' | 'facebook' | 'tiktok'

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'tiktok', label: 'TikTok' },
]

export type PlatformPreviewProps = {
  captions: string[]
  hashtagSets: string[][]
  signatureHashtags: string | null
  socialHandle: string | null
  propertyName: string
  mediaUrl: string | null
}

/**
 * Mock frame showing how the post will look on the chosen platform.
 * Defaults to Instagram. The user can pick a variant (one of the
 * three captions) to preview — useful when the variants vary in
 * length and one fits a given platform's vibe better than another.
 *
 * These are deliberately "vibe accurate" rather than pixel-perfect
 * recreations — we want to communicate "this is what your post will
 * feel like" without inviting trademark-style accuracy work.
 */
export function PlatformPreview(props: PlatformPreviewProps) {
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [variantIdx, setVariantIdx] = useState(
    // Default to the middle-length variant — usually the best preview.
    Math.min(1, Math.max(0, props.captions.length - 1)),
  )

  const caption = props.captions[variantIdx] ?? props.captions[0] ?? ''
  const aiHashtags = props.hashtagSets[variantIdx] ?? []
  const handle = normalizeHandle(props.socialHandle, props.propertyName)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Preview platform"
          className="inline-flex rounded-md border border-border-default bg-surface p-0.5"
        >
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={platform === p.id}
              onClick={() => setPlatform(p.id)}
              className={cn(
                'focus-ring inline-flex h-7 items-center rounded-sm px-3 text-xs font-medium transition-colors',
                platform === p.id
                  ? 'bg-fg text-surface'
                  : 'text-muted hover:text-fg',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {props.captions.length > 1 ? (
          <div
            role="tablist"
            aria-label="Caption variant"
            className="inline-flex rounded-md border border-border-default bg-surface p-0.5"
          >
            {props.captions.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={variantIdx === i}
                onClick={() => setVariantIdx(i)}
                className={cn(
                  'focus-ring inline-flex h-7 w-7 items-center justify-center rounded-sm text-xs font-medium transition-colors',
                  variantIdx === i
                    ? 'bg-fg text-surface'
                    : 'text-muted hover:text-fg',
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex justify-center rounded-md border border-border-subtle bg-surface-muted px-3 py-4 sm:px-4 sm:py-5">
        {platform === 'instagram' ? (
          <InstagramFrame
            handle={handle}
            caption={caption}
            aiHashtags={aiHashtags}
            signatureHashtags={props.signatureHashtags}
            mediaUrl={props.mediaUrl}
          />
        ) : platform === 'facebook' ? (
          <FacebookFrame
            propertyName={props.propertyName}
            caption={caption}
            aiHashtags={aiHashtags}
            signatureHashtags={props.signatureHashtags}
            mediaUrl={props.mediaUrl}
          />
        ) : (
          <TikTokFrame
            handle={handle}
            caption={caption}
            aiHashtags={aiHashtags}
            signatureHashtags={props.signatureHashtags}
            mediaUrl={props.mediaUrl}
          />
        )}
      </div>
    </div>
  )
}

function normalizeHandle(
  handle: string | null,
  propertyName: string,
): string {
  const raw = (handle ?? '').trim()
  if (raw) {
    return raw.startsWith('@') ? raw : `@${raw}`
  }
  return `@${propertyName.toLowerCase().replace(/[^a-z0-9]+/g, '')}`
}

// ---------------------------------------------------------------------------
// Instagram frame — square image, header with avatar + handle, caption below
// ---------------------------------------------------------------------------
function InstagramFrame({
  handle,
  caption,
  aiHashtags,
  signatureHashtags,
  mediaUrl,
}: {
  handle: string
  caption: string
  aiHashtags: string[]
  signatureHashtags: string | null
  mediaUrl: string | null
}) {
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-lg border border-border-subtle bg-surface shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600" />
        <span className="text-xs font-semibold text-fg">
          {handle.replace(/^@/, '')}
        </span>
        <span aria-hidden className="ml-auto text-fg">⋯</span>
      </div>
      <div className="aspect-square w-full bg-surface-muted">
        {mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <PlaceholderImage />
        )}
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <div className="flex items-center gap-3 text-fg">
          <Heart />
          <Comment />
          <Send />
          <span aria-hidden className="ml-auto">⛌</span>
        </div>
        <p className="text-xs leading-relaxed text-fg">
          <span className="font-semibold">{handle.replace(/^@/, '')}</span>{' '}
          <span className="whitespace-pre-wrap">{caption}</span>
        </p>
        <HashtagLine aiHashtags={aiHashtags} signatureHashtags={signatureHashtags} />
        <p className="text-[10px] uppercase tracking-wider text-subtle">
          Just now
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Facebook frame — wider card, name + timestamp, image, fuller caption
// ---------------------------------------------------------------------------
function FacebookFrame({
  propertyName,
  caption,
  aiHashtags,
  signatureHashtags,
  mediaUrl,
}: {
  propertyName: string
  caption: string
  aiHashtags: string[]
  signatureHashtags: string | null
  mediaUrl: string | null
}) {
  return (
    <div className="w-full max-w-md overflow-hidden rounded-lg border border-border-subtle bg-surface shadow-sm">
      <div className="flex items-center gap-2.5 px-3 py-3">
        <div className="h-9 w-9 rounded-full bg-[#1877F2]" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg">{propertyName}</p>
          <p className="text-[11px] text-subtle">
            Just now · <span aria-hidden>🌐</span>
          </p>
        </div>
        <span aria-hidden className="ml-auto text-fg">⋯</span>
      </div>
      <div className="px-3 pb-3 text-sm leading-relaxed text-fg whitespace-pre-wrap">
        {caption}
      </div>
      <div className="border-t border-b border-border-subtle bg-surface-muted">
        {mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl}
            alt=""
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          <div className="aspect-[4/3] w-full">
            <PlaceholderImage />
          </div>
        )}
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <HashtagLine
          aiHashtags={aiHashtags}
          signatureHashtags={signatureHashtags}
        />
        <div className="flex items-center gap-4 border-t border-border-subtle pt-2 text-xs text-muted">
          <span>👍 Like</span>
          <span>💬 Comment</span>
          <span>↗ Share</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TikTok frame — vertical 9:16, caption overlay style
// ---------------------------------------------------------------------------
function TikTokFrame({
  handle,
  caption,
  aiHashtags,
  signatureHashtags,
  mediaUrl,
}: {
  handle: string
  caption: string
  aiHashtags: string[]
  signatureHashtags: string | null
  mediaUrl: string | null
}) {
  const trimmed = caption.length > 150 ? `${caption.slice(0, 147)}…` : caption
  return (
    <div className="relative w-[220px] overflow-hidden rounded-xl bg-black shadow-md aspect-[9/16]">
      {mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-90"
        />
      ) : (
        <div className="absolute inset-0">
          <PlaceholderImage dark />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/30" />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 text-white text-[10px]">
        <span className="flex flex-col items-center">
          <Heart filled />
          <span>0</span>
        </span>
        <span className="flex flex-col items-center">
          <Comment />
          <span>0</span>
        </span>
        <span className="flex flex-col items-center">
          <Send />
          <span>Share</span>
        </span>
      </div>
      <div className="absolute bottom-0 left-0 right-12 p-3 text-white">
        <p className="text-xs font-semibold">{handle}</p>
        <p className="mt-1 text-[11px] leading-snug whitespace-pre-wrap">
          {trimmed}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {[...aiHashtags, ...splitSignatureHashtags(signatureHashtags)]
            .slice(0, 4)
            .map((tag) => (
              <span key={tag} className="text-[10px] text-white/90">
                {tag}
              </span>
            ))}
        </div>
      </div>
    </div>
  )
}

function HashtagLine({
  aiHashtags,
  signatureHashtags,
}: {
  aiHashtags: string[]
  signatureHashtags: string | null
}) {
  const all = [...aiHashtags, ...splitSignatureHashtags(signatureHashtags)]
  if (all.length === 0) return null
  return (
    <p className="text-xs leading-relaxed text-[#003569]">
      {all.join(' ')}
    </p>
  )
}

function splitSignatureHashtags(value: string | null): string[] {
  if (!value) return []
  return value
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.startsWith('#') && t.length > 1)
}

function PlaceholderImage({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center text-xs',
        dark ? 'text-white/60' : 'text-subtle',
      )}
    >
      <span>No image — pair one before posting</span>
    </div>
  )
}

function Heart({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} aria-hidden>
      <path
        d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Comment() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 12a8 8 0 1 1-3.2-6.4L21 4l-1 4.5A8 8 0 0 1 21 12Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Send() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}
