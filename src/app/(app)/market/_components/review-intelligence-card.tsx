import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import type { ReviewSentimentSignal } from '@/lib/supabase/types'

export function ReviewIntelligenceCard({
  signal,
  hasTripadvisorUrl,
}: {
  signal: ReviewSentimentSignal | null
  hasTripadvisorUrl: boolean
}) {
  if (!hasTripadvisorUrl) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review intelligence</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          <p className="text-sm text-muted">
            Add your TripAdvisor URL on{' '}
            <span className="text-fg">/market/settings</span> to start
            tracking guest sentiment, rating trends, and how you stack up
            vs. comparable properties.
          </p>
        </CardBody>
      </Card>
    )
  }

  if (!signal) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review intelligence</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-muted">
            We&apos;re collecting your first 30 days of reviews. Insights
            land within 24 hours.
          </p>
        </CardBody>
      </Card>
    )
  }

  const ratingTone =
    (signal.rating_avg ?? 0) >= 4.5
      ? 'success'
      : (signal.rating_avg ?? 0) >= 4.0
        ? 'info'
        : (signal.rating_avg ?? 0) >= 3.5
          ? 'warning'
          : 'danger'

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Review intelligence</CardTitle>
        <span className="text-xs text-subtle">Last 30 days · TripAdvisor</span>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Rating"
            value={signal.rating_avg != null ? signal.rating_avg.toFixed(1) : '—'}
            tone={ratingTone}
            hint={
              signal.rating_delta_vs_prev != null
                ? `${signal.rating_delta_vs_prev >= 0 ? '+' : ''}${signal.rating_delta_vs_prev.toFixed(2)} vs prior 30d`
                : undefined
            }
          />
          <Stat label="Reviews" value={signal.review_count_window} />
          <Stat
            label="vs comp set"
            value={
              signal.vs_competitor_delta != null
                ? `${signal.vs_competitor_delta >= 0 ? '+' : ''}${signal.vs_competitor_delta.toFixed(2)}`
                : '—'
            }
            tone={
              signal.vs_competitor_delta == null
                ? 'neutral'
                : signal.vs_competitor_delta >= 0
                  ? 'success'
                  : 'warning'
            }
            hint={
              signal.competitor_avg != null
                ? `Comp avg ${signal.competitor_avg.toFixed(1)}`
                : undefined
            }
          />
          <Stat
            label="Sentiment"
            value={
              signal.sentiment_avg != null
                ? `${signal.sentiment_avg >= 0 ? '+' : ''}${signal.sentiment_avg.toFixed(2)}`
                : '—'
            }
            hint="-1 to +1"
          />
        </div>

        {(signal.top_praise_theme || signal.top_complaint_theme) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {signal.top_praise_theme ? (
              <span className="inline-flex items-center gap-2">
                <Badge tone="success">Praised</Badge>
                <span className="text-muted">{signal.top_praise_theme}</span>
              </span>
            ) : null}
            {signal.top_complaint_theme ? (
              <span className="inline-flex items-center gap-2">
                <Badge tone="warning">Mentioned negatively</Badge>
                <span className="text-muted">{signal.top_complaint_theme}</span>
              </span>
            ) : null}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function Stat({
  label,
  value,
  tone = 'neutral',
  hint,
}: {
  label: string
  value: string | number
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  hint?: string
}) {
  const toneClass = {
    neutral: 'text-fg',
    success: 'text-success-fg',
    warning: 'text-warning-fg',
    danger: 'text-danger-fg',
    info: 'text-info-fg',
  }[tone]
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-subtle">{label}</p>
      <p className={`mt-1 text-xl font-semibold tracking-tight tabular-nums ${toneClass}`}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[10px] text-muted">{hint}</p> : null}
    </div>
  )
}
