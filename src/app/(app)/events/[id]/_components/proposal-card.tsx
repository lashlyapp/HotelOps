'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import type { Event } from '@/lib/supabase/types'
import { generateProposalLinkAction } from '../../actions'

export function ProposalCard({ event }: { event: Event }) {
  const [copied, setCopied] = useState(false)

  const url =
    event.proposal_token && typeof window !== 'undefined'
      ? `${window.location.origin}/proposal/${event.proposal_token}`
      : event.proposal_token
        ? `/proposal/${event.proposal_token}`
        : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Client proposal</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {!event.proposal_token ? (
          <>
            <p className="text-sm text-muted">
              Generate a tokenized link the client can open in their browser to
              review pricing and accept or decline.
            </p>
            <form action={generateProposalLinkAction}>
              <input type="hidden" name="id" value={event.id} />
              <Button type="submit" size="sm">
                Generate proposal link
              </Button>
            </form>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {event.proposal_response === 'accepted' ? (
                <Badge tone="success">Accepted</Badge>
              ) : event.proposal_response === 'declined' ? (
                <Badge tone="danger">Declined</Badge>
              ) : event.proposal_viewed_at ? (
                <Badge tone="info">Viewed</Badge>
              ) : (
                <Badge tone="neutral">Sent — not viewed</Badge>
              )}
            </div>
            <div className="space-y-1 text-xs text-muted">
              {event.proposal_sent_at ? (
                <p>
                  Sent{' '}
                  {new Date(event.proposal_sent_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              ) : null}
              {event.proposal_viewed_at ? (
                <p>
                  Last viewed{' '}
                  {new Date(event.proposal_viewed_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              ) : null}
              {event.proposal_responded_at ? (
                <p>
                  Responded{' '}
                  {new Date(event.proposal_responded_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              ) : null}
            </div>
            <div className="rounded-md border border-border-subtle bg-surface-muted p-3">
              <p className="text-xs uppercase tracking-wider text-subtle">
                Public link
              </p>
              <p className="mt-1 break-all font-mono text-xs text-fg">
                {url}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    if (!url) return
                    try {
                      await navigator.clipboard.writeText(url)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    } catch {
                      // Clipboard API may be blocked; user can still select
                      // the text manually.
                    }
                  }}
                >
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-ring inline-flex items-center justify-center gap-2 h-8 px-3 text-xs rounded-sm bg-transparent text-fg hover:bg-surface-muted font-medium"
                  >
                    Preview
                  </a>
                ) : null}
              </div>
            </div>
            <form action={generateProposalLinkAction}>
              <input type="hidden" name="id" value={event.id} />
              <button
                type="submit"
                className="focus-ring rounded-sm text-xs text-muted underline hover:text-fg"
              >
                Mark as re-sent
              </button>
            </form>
          </>
        )}
      </CardBody>
    </Card>
  )
}
