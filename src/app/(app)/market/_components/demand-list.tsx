import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  DemandSignalType,
  MarketDemandSignal,
  SignalConfidence,
} from '@/lib/supabase/types'

const TYPE_LABEL: Record<DemandSignalType, string> = {
  convention: 'Convention',
  concert: 'Concert',
  sports: 'Sports',
  festival: 'Festival',
  holiday: 'Holiday',
  seasonal: 'Seasonal',
  compression: 'Market compression',
}

const CONFIDENCE_TONE: Record<
  SignalConfidence,
  'neutral' | 'success' | 'warning' | 'info'
> = {
  low: 'neutral',
  medium: 'info',
  high: 'success',
}

export function DemandList({ signals }: { signals: MarketDemandSignal[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Demand window — next 21 days</CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        {signals.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">
            No major demand events detected. Standard seasonal patterns
            apply.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {signals.map((signal) => (
              <li
                key={signal.id}
                className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-subtle">
                    <Badge tone="neutral">{TYPE_LABEL[signal.signal_type]}</Badge>
                    <span>
                      {new Date(
                        signal.signal_date + 'T00:00:00',
                      ).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span>·</span>
                    <span>Intensity {signal.intensity}/5</span>
                  </div>
                  <p className="text-sm text-fg">{signal.headline}</p>
                </div>
                <Badge
                  tone={CONFIDENCE_TONE[signal.confidence]}
                  className="self-start"
                >
                  {signal.confidence} confidence
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
