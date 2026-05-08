import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { requireSession } from '@/lib/auth/session'
import { BRAND, BRAND_ADDRESS_LINES } from '@/lib/brand'
import { createClient } from '@/lib/supabase/server'
import type { Invoice } from '@/lib/supabase/types'

export default async function BillingPage() {
  const session = await requireSession()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('org_id', session.organization.id)
    .order('period_end', { ascending: false })

  if (error) throw error
  const invoices = (data ?? []) as Invoice[]

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Billing
        </h1>
        <p className="mt-1 text-sm text-muted">
          Pay by check. We&apos;ll mark invoices paid once received.
        </p>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-subtle">
            <tr>
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Due</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {invoices.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-sm text-muted"
                >
                  No invoices yet.
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-4 py-3 text-fg">
                    {formatDate(invoice.period_start)} —{' '}
                    {formatDate(invoice.period_end)}
                  </td>
                  <td className="px-4 py-3 font-medium text-fg tabular-nums">
                    {formatMoney(invoice.amount_cents, invoice.currency)}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {invoice.due_date ? formatDate(invoice.due_date) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={invoice.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Card>
        <div className="p-5 space-y-2">
          <h2 className="text-sm font-semibold text-fg">Mailing instructions</h2>
          <p className="text-sm text-muted">
            Make checks payable to <span className="text-fg font-medium">{BRAND.legalName}</span>.
            Mail to:
          </p>
          <address className="not-italic text-sm text-muted leading-6">
            {BRAND_ADDRESS_LINES.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </address>
        </div>
      </Card>
    </div>
  )
}

function StatusBadge({ status }: { status: Invoice['status'] }) {
  const tone =
    status === 'paid' ? 'success' : status === 'pending' ? 'warning' : 'neutral'
  return <Badge tone={tone}>{status}</Badge>
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(cents / 100)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
