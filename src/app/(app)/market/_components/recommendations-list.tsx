import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { typeLabel } from '@/lib/market/recommendations'
import type { PricingRecommendation } from '@/lib/supabase/types'
import { actOnRecommendationAction } from '../actions'

function priorityTone(
  priority: number,
): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (priority >= 5) return 'danger'
  if (priority >= 4) return 'warning'
  if (priority >= 3) return 'info'
  return 'neutral'
}

export function RecommendationsList({
  recommendations,
}: {
  recommendations: PricingRecommendation[]
}) {
  const active = recommendations.filter((r) => !r.acted_at)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing opportunities</CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        {active.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">
            No active recommendations — pricing looks in line with the market.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {active.map((r) => (
              <li key={r.id} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-subtle">
                      <Badge tone={priorityTone(r.priority)}>
                        {typeLabel(r.recommendation_type)}
                      </Badge>
                      <span>
                        {new Date(
                          r.target_date + 'T00:00:00',
                        ).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      <span>·</span>
                      <span>{r.confidence} confidence</span>
                    </div>
                    <p className="text-sm font-medium text-fg">{r.headline}</p>
                    {r.rationale ? (
                      <p className="text-sm text-muted">{r.rationale}</p>
                    ) : null}
                  </div>
                </div>
                <form
                  action={actOnRecommendationAction}
                  className="flex items-center justify-end"
                >
                  <input
                    type="hidden"
                    name="recommendation_id"
                    value={r.id}
                  />
                  <button
                    type="submit"
                    className="focus-ring rounded-sm text-xs font-medium text-muted hover:text-fg"
                  >
                    Mark as acted on →
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
