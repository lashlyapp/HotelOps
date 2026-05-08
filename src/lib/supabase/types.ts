export type AppRole = 'platform_admin' | 'org_owner' | 'org_staff'
export type InvoiceStatus = 'pending' | 'paid' | 'void'

export type Organization = {
  id: string
  slug: string
  name: string
  created_at: string
}

export type Profile = {
  id: string
  org_id: string | null
  role: AppRole
  full_name: string | null
  created_at: string
}

export type Property = {
  id: string
  org_id: string
  slug: string
  name: string
  r2_prefix: string
  created_at: string
}

export type Invoice = {
  id: string
  org_id: string
  amount_cents: number
  currency: string
  status: InvoiceStatus
  period_start: string
  period_end: string
  due_date: string | null
  paid_at: string | null
  payment_method: string | null
  notes: string | null
  created_at: string
}
