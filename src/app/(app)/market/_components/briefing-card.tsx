import { Badge } from '@/components/ui/badge'
import { Card, CardBody } from '@/components/ui/card'
import type {
  DailyMarketBriefing,
  DemandOutlook,
} from '@/lib/supabase/types'

const OUTLOOK_TONE: Record<
  DemandOutlook,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  soft: 'neutral',
  steady: 'info',
  strong: 'success',
  compressed: 'warning',
}

const OUTLOOK_LABEL: Record<DemandOutlook, string> = {
  soft: 'Soft demand',
  steady: 'Steady demand',
  strong: 'Strong demand',
  compressed: 'Compressed market',
}

export function BriefingCard({
  briefing,
  propertyName,
}: {
  briefing: DailyMarketBriefing
  propertyName: string
}) {
  return (
    <Card className="border-l-4 border-l-primary">
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-subtle">
              {propertyName} — daily briefing
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-fg">
              {briefing.headline}
            </h2>
          </div>
          <Badge tone={OUTLOOK_TONE[briefing.demand_outlook]}>
            {OUTLOOK_LABEL[briefing.demand_outlook]}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="rounded-full bg-surface-muted px-2.5 py-0.5">
            {briefing.opportunity_count} opportunit
            {briefing.opportunity_count === 1 ? 'y' : 'ies'}
          </span>
          <span className="rounded-full bg-surface-muted px-2.5 py-0.5">
            {briefing.alert_count} alert
            {briefing.alert_count === 1 ? '' : 's'}
          </span>
          <span className="text-subtle">·</span>
          <span className="text-subtle">
            {new Date(briefing.briefing_date + 'T00:00:00').toLocaleDateString(
              'en-US',
              { weekday: 'long', month: 'short', day: 'numeric' },
            )}
          </span>
        </div>

        <div className="space-y-3 text-sm leading-relaxed text-fg whitespace-pre-wrap">
          {briefing.body}
        </div>
      </CardBody>
    </Card>
  )
}
