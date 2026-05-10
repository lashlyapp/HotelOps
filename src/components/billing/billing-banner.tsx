import Link from 'next/link'
import type { BillingGate } from '@/lib/billing/gate'

/**
 * App-shell banner shown across the entire tenant app whenever billing is
 * delinquent. The copy + tone come from the gate's decision; the link always
 * routes to /billing.
 */
export function BillingBanner({ gate }: { gate: BillingGate }) {
  if (!gate.banner || !gate.message) return null
  const tone = gate.restrictWrites ? 'danger' : 'warning'
  const cls =
    tone === 'danger'
      ? 'bg-danger-bg text-danger-fg border-danger-bg'
      : 'bg-warning-bg text-warning-fg border-warning-bg'
  return (
    <div
      role="alert"
      className={`border-b px-6 py-2.5 text-sm flex items-center gap-3 ${cls}`}
    >
      <span className="font-medium">Billing</span>
      <span className="flex-1">{gate.message}</span>
      <Link
        href="/billing"
        className="focus-ring rounded-sm font-medium underline underline-offset-2"
      >
        Open Billing
      </Link>
    </div>
  )
}
