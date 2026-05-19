import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  CompetitorArchetype,
  PropertyCompetitor,
} from '@/lib/supabase/types'

const ARCHETYPE_LABEL: Record<CompetitorArchetype, string> = {
  similar_boutique: 'Similar boutique',
  lifestyle_peer: 'Lifestyle peer',
  upscale_chain: 'Upscale chain',
  independent_peer: 'Independent peer',
}

export function CompetitorList({
  competitors,
  currencyCode,
}: {
  competitors: PropertyCompetitor[]
  currencyCode: string
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Comp set</CardTitle>
        <span className="text-xs text-subtle">
          Auto-detected · adjust on Settings
        </span>
      </CardHeader>
      <CardBody className="p-0">
        {competitors.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">
            No comparable properties detected yet.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {competitors.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-fg">
                    {c.competitor_name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {ARCHETYPE_LABEL[c.archetype]}
                    {c.distance_km != null ? ` · ${c.distance_km} km away` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {c.adr_floor != null && c.adr_ceiling != null ? (
                    <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-muted tabular-nums">
                      {currencyCode} {Math.round(c.adr_floor)}–
                      {Math.round(c.adr_ceiling)}
                    </span>
                  ) : null}
                  <Badge tone="neutral">{c.match_score}% match</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
