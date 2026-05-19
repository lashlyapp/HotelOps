import type { DemandOutlook } from '@/lib/supabase/types'

// 30-day demand outlook trail. Each day is a small dot/bar coloured
// by outlook so the GM can see at a glance whether their market has
// been compressing, softening, or steady. No interactivity in v1 —
// pure visual cue.

export type OutlookHistoryItem = {
  briefing_date: string
  demand_outlook: DemandOutlook
}

const OUTLOOK_HEIGHT: Record<DemandOutlook, number> = {
  soft: 6,
  steady: 10,
  strong: 16,
  compressed: 22,
}

const OUTLOOK_COLOR: Record<DemandOutlook, string> = {
  soft: 'var(--color-border-default, #d6d3d1)',
  steady: 'var(--color-info-fg, #0284c7)',
  strong: 'var(--color-success-fg, #16a34a)',
  compressed: 'var(--color-warning-fg, #ca8a04)',
}

const BAR_WIDTH = 6
const BAR_GAP = 2
const HEIGHT = 28

export function OutlookSparkline({ history }: { history: OutlookHistoryItem[] }) {
  if (history.length === 0) return null
  // Order oldest → newest left to right.
  const sorted = [...history].sort((a, b) => a.briefing_date.localeCompare(b.briefing_date))
  const width = sorted.length * (BAR_WIDTH + BAR_GAP)

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-subtle">
      <span className="uppercase tracking-wider">Last {sorted.length} days</span>
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label="Demand outlook history"
      >
        {sorted.map((item, i) => {
          const h = OUTLOOK_HEIGHT[item.demand_outlook]
          const y = HEIGHT - h
          return (
            <rect
              key={item.briefing_date}
              x={i * (BAR_WIDTH + BAR_GAP)}
              y={y}
              width={BAR_WIDTH}
              height={h}
              rx={1}
              fill={OUTLOOK_COLOR[item.demand_outlook]}
            >
              <title>{`${item.briefing_date}: ${item.demand_outlook}`}</title>
            </rect>
          )
        })}
      </svg>
      <span className="flex items-center gap-1.5">
        <Dot color={OUTLOOK_COLOR.soft} /> soft
        <Dot color={OUTLOOK_COLOR.steady} /> steady
        <Dot color={OUTLOOK_COLOR.strong} /> strong
        <Dot color={OUTLOOK_COLOR.compressed} /> compressed
      </span>
    </div>
  )
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="ml-1 inline-block h-2 w-2 rounded-full"
      style={{ background: color }}
    />
  )
}
