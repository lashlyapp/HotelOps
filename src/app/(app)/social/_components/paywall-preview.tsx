'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Card, CardBody } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'
import type { SamplePost } from '../_lib/sample-post'
import { PlatformPreview } from './platform-preview'

const MONTHLY_PRICE = 19

/**
 * Rendered on /social when the org does NOT have the Social Studio
 * add-on. Shows the fixed sample post — captions, hashtags, platform
 * preview, image — exactly the way a real post would render, with
 * the feedback/email/mark-used controls swapped for an "Enable Social
 * Studio" CTA pointed at /billing. The sample never changes; daily
 * rotation only starts after activation.
 */
export function PaywallPreview({
  sample,
  propertyName,
  propertyCount,
}: {
  sample: SamplePost
  propertyName: string
  propertyCount: number
}) {
  const monthlyTotal = MONTHLY_PRICE * Math.max(propertyCount, 1)
  const propertyWord = propertyCount === 1 ? 'property' : 'properties'

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-4 border-l-4 border-l-fg bg-surface-muted/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-subtle">
                Sample · what you&apos;ll get every morning
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-fg">
                Social Studio — ${MONTHLY_PRICE} / {propertyWord} / month
              </h2>
              <p className="mt-1 text-sm text-muted max-w-xl">
                The post below is a fixed example. Enable Social Studio and your team gets a fresh, on-brand draft like this — every morning, for every property — pulled from your events, your weather, and your media library.
              </p>
            </div>
            <Link
              href="/billing"
              className="focus-ring inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
            >
              Enable for ${monthlyTotal} / mo
            </Link>
          </div>
          <ul className="grid grid-cols-1 gap-2 text-xs text-muted sm:grid-cols-2">
            <li>· One AI-drafted post per property per day</li>
            <li>· Three caption variants per post, with topical hashtags</li>
            <li>· Image picked from your media catalog by tag</li>
            <li>· Platform-accurate preview for Instagram, Facebook, TikTok</li>
            <li>· Thumbs up/down trains the brand voice over time</li>
            <li>· Email today&apos;s post to yourself in one click</li>
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-5 opacity-95">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-subtle">
              Today&apos;s angle
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-fg">
              {sample.topicLabel}
            </h2>
            <p className="mt-1 text-sm text-muted max-w-xl">{sample.topicHint}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-subtle">
              <span>{sample.postDateLabel}</span>
              {sample.weatherPhrase ? <span>· {sample.weatherPhrase}</span> : null}
            </p>
          </div>

          <PlatformPreview
            captions={sample.captions}
            hashtagSets={sample.hashtagSets}
            signatureHashtags={null}
            socialHandle={null}
            propertyName={propertyName}
            mediaUrl={sample.imageSrc}
          />

          <div className="overflow-hidden rounded-md border border-border-subtle">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sample.imageSrc}
              alt={sample.imageAlt}
              className="w-full max-h-80 object-cover"
            />
            <div className="border-t border-border-subtle bg-surface-muted px-3 py-2 text-xs text-muted">
              Sample image — Social Studio picks from your own media catalog.
            </div>
          </div>

          <div className="space-y-3">
            {sample.captions.map((caption, i) => (
              <SampleCaptionRow
                key={i}
                caption={caption}
                aiHashtags={sample.hashtagSets[i] ?? []}
                index={i}
              />
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t border-border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">
              Enable Social Studio to start getting a fresh post like this every morning, plus thumbs feedback that learns your voice.
            </p>
            <Link
              href="/billing"
              className="focus-ring inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
            >
              Enable Social Studio
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function SampleCaptionRow({
  caption,
  aiHashtags,
  index,
}: {
  caption: string
  aiHashtags: string[]
  index: number
}) {
  const [copied, setCopied] = useState(false)
  const full = aiHashtags.length > 0 ? `${caption}\n\n${aiHashtags.join(' ')}` : caption

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(full)
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
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-border-default bg-surface px-2.5 text-xs font-medium text-fg hover:bg-surface-muted',
          )}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
