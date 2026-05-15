import 'server-only'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'
import type { MediaFile } from '@/lib/r2/list'

const DAYS = 30
const MS_PER_DAY = 86_400_000

type Bucket = { key: string; count: number }

function bucketDailyUploads(files: MediaFile[]): {
  current: Bucket[]
  total: number
  prevTotal: number
  peak: number
} {
  const now = new Date()
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  )
  const earliest = today - (DAYS * 2 - 1) * MS_PER_DAY

  const counts = new Map<string, number>()
  for (let i = 0; i < DAYS * 2; i++) {
    const ts = today - i * MS_PER_DAY
    counts.set(new Date(ts).toISOString().slice(0, 10), 0)
  }

  for (const f of files) {
    if (!f.lastModified) continue
    const t = Date.parse(f.lastModified)
    if (Number.isNaN(t) || t < earliest) continue
    const key = new Date(t).toISOString().slice(0, 10)
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const current: Bucket[] = []
  let total = 0
  let peak = 0
  for (let i = DAYS - 1; i >= 0; i--) {
    const ts = today - i * MS_PER_DAY
    const key = new Date(ts).toISOString().slice(0, 10)
    const count = counts.get(key) ?? 0
    current.push({ key, count })
    total += count
    if (count > peak) peak = count
  }

  let prevTotal = 0
  for (let i = DAYS; i < DAYS * 2; i++) {
    const ts = today - i * MS_PER_DAY
    const key = new Date(ts).toISOString().slice(0, 10)
    prevTotal += counts.get(key) ?? 0
  }

  return { current, total, prevTotal, peak }
}

export function UploadsChartCard({ files }: { files: MediaFile[] }) {
  const { current, total, prevTotal, peak } = bucketDailyUploads(files)
  const delta = total - prevTotal
  const deltaPct = prevTotal > 0 ? Math.round((delta / prevTotal) * 100) : null

  const W = 300
  const H = 64
  const yMax = Math.max(peak, 1)
  const step = current.length > 1 ? W / (current.length - 1) : W
  const points = current.map((b, i) => {
    const x = i * step
    const y = H - 4 - (b.count / yMax) * (H - 8)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const linePath = points.length
    ? `M ${points[0]} L ${points.slice(1).join(' L ')}`
    : ''
  const areaPath = points.length
    ? `${linePath} L ${W},${H} L 0,${H} Z`
    : ''

  const hasAnyData = total > 0 || prevTotal > 0

  return (
    <Card className="relative overflow-hidden p-4">
      <p className="text-xs uppercase tracking-wider text-subtle">
        Uploads · last 30 days
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-2xl font-semibold tracking-tight text-fg tabular-nums">
          {total}
        </p>
        {deltaPct !== null ? (
          <span
            className={cn(
              'text-xs font-medium tabular-nums',
              delta > 0
                ? 'text-success-fg'
                : delta < 0
                  ? 'text-danger-fg'
                  : 'text-muted',
            )}
          >
            {delta > 0 ? '↑' : delta < 0 ? '↓' : '·'} {Math.abs(deltaPct)}%
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {hasAnyData ? 'vs prior 30 days' : 'No uploads yet'}
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Daily upload counts for the last ${DAYS} days, totaling ${total} uploads.`}
        className="mt-3 block h-14 w-full"
      >
        <defs>
          <linearGradient id="uploads-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {hasAnyData ? (
          <>
            <path d={areaPath} fill="url(#uploads-fill)" />
            <path
              d={linePath}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : (
          <line
            x1="0"
            x2={W}
            y1={H - 4}
            y2={H - 4}
            stroke="var(--border-default)"
            strokeWidth="1"
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </Card>
  )
}
