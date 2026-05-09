import type { EventLineItem } from '@/lib/supabase/types'

export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Single source of truth for the pricing math. Service charge applies to
// service-chargeable lines; tax applies to taxable lines AND to the service
// charge attributable to those taxable lines (the most common US convention).
// If we discover jurisdictions that demand different ordering, this is the
// one place to fix.
export type PricingTotals = {
  subtotal_cents: number
  service_charge_cents: number
  tax_cents: number
  total_cents: number
}

export function computeTotals(
  lines: Pick<
    EventLineItem,
    'quantity' | 'unit_price_cents' | 'taxable' | 'service_chargeable'
  >[],
  service_charge_pct: number,
  tax_pct: number,
): PricingTotals {
  let subtotal = 0
  let serviceChargeable = 0
  let taxableSubtotal = 0
  let taxableServiceCharge = 0

  for (const l of lines) {
    const lineTotal = Math.round(Number(l.quantity) * l.unit_price_cents)
    subtotal += lineTotal
    if (l.service_chargeable) serviceChargeable += lineTotal
    if (l.taxable) {
      taxableSubtotal += lineTotal
      if (l.service_chargeable) taxableServiceCharge += lineTotal
    }
  }

  const service_charge_cents = Math.round(
    serviceChargeable * (service_charge_pct / 100),
  )
  const taxableServiceChargeAmount = Math.round(
    taxableServiceCharge * (service_charge_pct / 100),
  )
  const tax_cents = Math.round(
    (taxableSubtotal + taxableServiceChargeAmount) * (tax_pct / 100),
  )
  const total_cents = subtotal + service_charge_cents + tax_cents

  return { subtotal_cents: subtotal, service_charge_cents, tax_cents, total_cents }
}
