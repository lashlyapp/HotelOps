import 'server-only'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Shared billing-reset machinery used by:
 *   - scripts/reset-tenant-billing.ts (CLI; legacy/operator usage)
 *   - the platform-admin "Reset billing" UI on /admin/tenants/[id]
 *
 * The two entry points below — {@link previewTenantBillingReset} and
 * {@link executeTenantBillingReset} — share the same "find what would be
 * touched" walk so the confirmation surface shows exactly what the
 * execute step will do.
 *
 * Reset semantics:
 *  - Cancel every Stripe subscription on every Customer associated with
 *    the org (prorate:false, invoice_now:false — no refund, no new
 *    charge).
 *  - Void every open invoice + delete every draft invoice on those
 *    Customers, so the tenant isn't dunned for stale balances. Paid /
 *    void / uncollectible invoices are immutable history and are left
 *    alone.
 *  - Delete the org's billing_subscriptions rows.
 *  - Null organizations.setup_fee_charged_at so the next subscription
 *    re-claims the one-time setup fee.
 *  - hard=true also deletes the Stripe Customer and clears
 *    organizations.stripe_customer_id. Default (hard=false) preserves
 *    the Customer so saved cards / billing address / tax id survive
 *    and the tenant can resubscribe in one click.
 *  - Properties, members, R2 files, etc. are NEVER touched in any mode.
 */

export type ResetPreview = {
  orgId: string
  orgSlug: string
  orgName: string
  customerIds: string[]
  /** Subscriptions that WOULD be cancelled (status not already terminal). */
  subscriptionsToCancel: Array<{
    id: string
    status: string
    quantity: number | null
    priceId: string | null
    customerId: string
  }>
  /** Open + draft invoices that WOULD be voided/deleted. */
  invoicesToVoid: Array<{
    id: string
    status: string
    amount_due_cents: number
    currency: string
    customerId: string
  }>
  /** Total billing_subscriptions rows that WOULD be deleted. */
  dbRowsToDelete: number
  /** Whether setup_fee_charged_at is currently set on the org. */
  setupFeeStamped: boolean
  /** Whether the org has any non-canceled Stripe subscriptions to cancel. */
  hasWorkToDo: boolean
}

export type ResetSummary = {
  subscriptionsCancelled: number
  invoicesVoided: number
  dbRowsDeleted: number
  customersDeleted: number
  setupFeeReset: boolean
}

/**
 * Walk Stripe + the DB and report what a reset would touch — no writes
 * happen. Used both by the admin UI's "Preview" step and by the script's
 * dry-run mode.
 */
export async function previewTenantBillingReset(
  orgId: string,
): Promise<ResetPreview> {
  const { org, customerIds, subRows } = await loadOrgState(orgId)
  const s = stripe()

  const subscriptionsToCancel: ResetPreview['subscriptionsToCancel'] = []
  const invoicesToVoid: ResetPreview['invoicesToVoid'] = []

  for (const customerId of customerIds) {
    for await (const sub of s.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
    })) {
      if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
        continue
      }
      subscriptionsToCancel.push({
        id: sub.id,
        status: sub.status,
        quantity: sub.items.data[0]?.quantity ?? null,
        priceId: sub.items.data[0]?.price?.id ?? null,
        customerId,
      })
    }
    for await (const inv of s.invoices.list({
      customer: customerId,
      limit: 100,
    })) {
      if (inv.status !== 'open' && inv.status !== 'draft') continue
      if (!inv.id) continue
      invoicesToVoid.push({
        id: inv.id,
        status: inv.status,
        amount_due_cents: inv.amount_due ?? 0,
        currency: inv.currency ?? 'usd',
        customerId,
      })
    }
  }

  return {
    orgId: org.id,
    orgSlug: org.slug,
    orgName: org.name,
    customerIds,
    subscriptionsToCancel,
    invoicesToVoid,
    dbRowsToDelete: subRows.length,
    setupFeeStamped: Boolean(org.setup_fee_charged_at),
    hasWorkToDo:
      subscriptionsToCancel.length > 0 ||
      invoicesToVoid.length > 0 ||
      subRows.length > 0 ||
      Boolean(org.setup_fee_charged_at),
  }
}

/**
 * Actually perform the reset. Idempotent for any already-terminal state
 * (a subscription that's already canceled is skipped; a row that's
 * already deleted is a no-op delete). Safe to re-run after a partial
 * failure — re-running picks up wherever the previous run died.
 */
export async function executeTenantBillingReset(
  orgId: string,
  options: { hard?: boolean } = {},
): Promise<ResetSummary> {
  const hard = options.hard === true
  const admin = createAdminClient()
  const s = stripe()
  const { org, customerIds, subRows } = await loadOrgState(orgId)

  let subscriptionsCancelled = 0
  let invoicesVoided = 0
  let customersDeleted = 0

  for (const customerId of customerIds) {
    for await (const sub of s.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
    })) {
      if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
        continue
      }
      await s.subscriptions.cancel(sub.id, {
        invoice_now: false,
        prorate: false,
      })
      subscriptionsCancelled++
    }
    for await (const inv of s.invoices.list({
      customer: customerId,
      limit: 100,
    })) {
      if (!inv.id) continue
      if (inv.status === 'draft') {
        await s.invoices.del(inv.id)
        invoicesVoided++
      } else if (inv.status === 'open') {
        await s.invoices.voidInvoice(inv.id)
        invoicesVoided++
      }
    }
  }

  // DB cleanup happens AFTER Stripe so a Stripe failure leaves the DB
  // pointing at the (now-canceled) Stripe state — re-running the reset
  // will skip the already-canceled subs and finish the DB step.
  const { error: delErr } = await admin
    .from('billing_subscriptions')
    .delete()
    .eq('org_id', orgId)
  if (delErr) throw delErr
  const dbRowsDeleted = subRows.length

  const updates: Record<string, unknown> = {}
  if (org.setup_fee_charged_at) updates.setup_fee_charged_at = null
  if (hard) {
    for (const customerId of customerIds) {
      try {
        await s.customers.del(customerId)
        customersDeleted++
      } catch (err) {
        // Already-deleted Customer comes back as 404 from Stripe; treat
        // as success for idempotency.
        const msg = err instanceof Error ? err.message : ''
        if (!/no such customer/i.test(msg)) throw err
      }
    }
    if (org.stripe_customer_id) updates.stripe_customer_id = null
  }
  if (Object.keys(updates).length > 0) {
    const { error: updErr } = await admin
      .from('organizations')
      .update(updates)
      .eq('id', orgId)
    if (updErr) throw updErr
  }

  return {
    subscriptionsCancelled,
    invoicesVoided,
    dbRowsDeleted,
    customersDeleted,
    setupFeeReset: Boolean(org.setup_fee_charged_at),
  }
}

async function loadOrgState(orgId: string) {
  const admin = createAdminClient()

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('id, slug, name, stripe_customer_id, setup_fee_charged_at')
    .eq('id', orgId)
    .maybeSingle()
  if (orgErr) throw orgErr
  if (!org) throw new Error(`No organization with id "${orgId}".`)

  const { data: subRows, error: subErr } = await admin
    .from('billing_subscriptions')
    .select('property_id, stripe_customer_id, stripe_subscription_id, status')
    .eq('org_id', orgId)
  if (subErr) throw subErr

  // Resolve every candidate Customer id — the org-level column AND any
  // diverging Customer ids on individual billing_subscriptions rows. A
  // legacy flow may have created a separate Customer that the org row
  // never adopted.
  const customerIds = new Set<string>()
  if (org.stripe_customer_id) customerIds.add(org.stripe_customer_id)
  for (const r of subRows ?? []) {
    if (r.stripe_customer_id) customerIds.add(r.stripe_customer_id)
  }

  return {
    org,
    customerIds: [...customerIds],
    subRows: subRows ?? [],
  }
}
