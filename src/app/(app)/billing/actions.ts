'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgOwner } from '@/lib/auth/session'
import {
  ADDONS,
  addAddonToProperty,
  removeAddonFromProperty,
  type AddonKey,
} from '@/lib/stripe/addons'
import { stripe } from '@/lib/stripe/client'
import { startSubscriptionForProperty } from '@/lib/stripe/start-subscription'
import {
  getStripeCustomerForOrg,
  payOpenInvoiceForSubscription,
  resolveResubscribePaymentMethod,
  syncSubscriptionToDb,
} from '@/lib/stripe/subscriptions'
import { createAdminClient } from '@/lib/supabase/admin'

export type ActionResult = { error?: string; success?: string }

/**
 * Swap a property's subscription onto a card already saved on the org's
 * Stripe Customer. The UI uses this for the "use this saved card" picker;
 * the green-field flow ("add a new card") still goes through Stripe
 * Checkout in setup mode via /api/stripe/setup-checkout.
 *
 * Authorization: org_owner only. We verify the property belongs to the
 * caller's org and that the payment method belongs to the org's Customer
 * before touching Stripe — both are anti-tampering checks against a
 * crafted request that tries to point property A at property B's card or
 * at an unrelated Customer's card.
 */
export async function setPropertyDefaultPaymentMethodAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgOwner()
  const propertyId = String(formData.get('property_id') ?? '')
  const paymentMethodId = String(formData.get('payment_method_id') ?? '')
  if (!propertyId || !paymentMethodId) {
    return { error: 'Missing property or payment method.' }
  }

  const admin = createAdminClient()
  const { data: sub, error: subErr } = await admin
    .from('billing_subscriptions')
    .select('stripe_subscription_id, org_id, property_id')
    .eq('property_id', propertyId)
    .maybeSingle()
  if (subErr) return { error: subErr.message }
  if (
    !sub?.stripe_subscription_id ||
    sub.org_id !== session.organization.id
  ) {
    return { error: 'Subscription not found for this property.' }
  }

  const customerId = await getStripeCustomerForOrg(session.organization.id)
  if (!customerId) {
    return { error: 'This org has no Stripe customer yet.' }
  }

  // Defense-in-depth: confirm the payment method is actually attached to
  // this org's Customer before we update a subscription with it. Stripe
  // would refuse the update if it weren't, but we'd rather fail with a
  // clear error message than surface a raw Stripe error to the UI.
  try {
    const pm = await stripe().paymentMethods.retrieve(paymentMethodId)
    const pmCustomer =
      typeof pm.customer === 'string' ? pm.customer : (pm.customer?.id ?? null)
    if (pmCustomer !== customerId) {
      return { error: 'Payment method does not belong to this customer.' }
    }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Could not verify payment method.',
    }
  }

  try {
    await stripe().subscriptions.update(sub.stripe_subscription_id, {
      default_payment_method: paymentMethodId,
      collection_method: 'charge_automatically',
    })
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Stripe rejected the update; try again.',
    }
  }

  // Try to pay any open invoice on this subscription with the newly-set
  // card — without this, a subscription started via send_invoice (admin
  // path or owner add-property path) keeps its first invoice OPEN even
  // after the customer "attaches a card", silently slipping into
  // past_due 14 days later. Best-effort: a decline just leaves the
  // invoice open and Stripe's dunning takes over.
  const payResult = await payOpenInvoiceForSubscription(
    sub.stripe_subscription_id,
    paymentMethodId,
  )

  // Re-fetch so the row reflects post-payment status (incomplete/past_due
  // → active when the new card cleared the open invoice). The trailing
  // subscription.updated webhook also fires; both writes are idempotent.
  const fresh = await stripe().subscriptions.retrieve(
    sub.stripe_subscription_id,
  )
  await syncSubscriptionToDb(propertyId, sub.org_id, fresh, {
    paymentMethodDueAt: null,
  })

  revalidatePath('/billing')
  return {
    success: payResult.paid
      ? 'Card updated and outstanding invoice paid.'
      : 'Card updated.',
  }
}

/**
 * Mark a saved card as the org's default for auto-pay on FUTURE property
 * additions. Stored on Stripe's Customer.invoice_settings, mirroring
 * what the autopay_default opt-in on Checkout does.
 *
 * Per-property subscription defaults are unaffected — setting this only
 * controls which card auto-charges when a new property is added without
 * an explicit Checkout flow.
 */
export async function setAutopayDefaultAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgOwner()
  const paymentMethodId = String(formData.get('payment_method_id') ?? '')
  if (!paymentMethodId) return { error: 'Missing payment method.' }

  const customerId = await getStripeCustomerForOrg(session.organization.id)
  if (!customerId) {
    return { error: 'This org has no Stripe customer yet.' }
  }

  try {
    const pm = await stripe().paymentMethods.retrieve(paymentMethodId)
    const pmCustomer =
      typeof pm.customer === 'string' ? pm.customer : (pm.customer?.id ?? null)
    if (pmCustomer !== customerId) {
      return { error: 'Payment method does not belong to this customer.' }
    }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Could not verify payment method.',
    }
  }

  try {
    await stripe().customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    })
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Stripe rejected the update; try again.',
    }
  }

  revalidatePath('/billing')
  return { success: 'Set as default for auto-pay on new properties.' }
}

/**
 * Detach a saved card from the org's Customer. Refuses when the card is
 * still the default on any of the org's active subscriptions — the
 * customer must switch that property to a different card (or remove the
 * subscription) first. This avoids the gotcha where detaching a card
 * mid-cycle leaves a property with no payment method on file just before
 * the next invoice.
 */
export async function detachPaymentMethodAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgOwner()
  const paymentMethodId = String(formData.get('payment_method_id') ?? '')
  if (!paymentMethodId) return { error: 'Missing payment method.' }

  const customerId = await getStripeCustomerForOrg(session.organization.id)
  if (!customerId) return { error: 'This org has no Stripe customer yet.' }

  // Confirm ownership (same defense as set-default).
  try {
    const pm = await stripe().paymentMethods.retrieve(paymentMethodId)
    const pmCustomer =
      typeof pm.customer === 'string' ? pm.customer : (pm.customer?.id ?? null)
    if (pmCustomer !== customerId) {
      return { error: 'Payment method does not belong to this customer.' }
    }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : 'Could not verify payment method.',
    }
  }

  const admin = createAdminClient()
  const { data: inUse, error: useErr } = await admin
    .from('billing_subscriptions')
    .select('property_id, status')
    .eq('org_id', session.organization.id)
    .eq('default_payment_method_id', paymentMethodId)
  if (useErr) return { error: useErr.message }
  const activeInUse = (inUse ?? []).filter(
    (s) => s.status !== 'canceled' && s.status !== 'incomplete_expired',
  )
  if (activeInUse.length > 0) {
    return {
      error:
        `This card is the default on ${activeInUse.length} ` +
        `propert${activeInUse.length === 1 ? 'y' : 'ies'}. Switch ` +
        `${activeInUse.length === 1 ? 'it' : 'them'} to another card ` +
        `before removing.`,
    }
  }

  try {
    await stripe().paymentMethods.detach(paymentMethodId)
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Stripe rejected the remove; try again.',
    }
  }

  revalidatePath('/billing')
  return { success: 'Card removed.' }
}

/**
 * Schedule a property's subscription for cancellation at the end of the
 * current billing period. The customer keeps full access to the property
 * (the gate treats `active + cancel_at_period_end` as unrestricted) and
 * is not charged for the next cycle. Reversible via
 * {@link resumeSubscriptionAction} any time before `current_period_end`.
 *
 * No data is touched — the property row, R2 files, etc. all stay. Once
 * the period ends Stripe fires customer.subscription.deleted, status
 * flips to `canceled`, and the per-property gate locks access. The
 * customer can resubscribe later via {@link resubscribePropertyAction}
 * and pick up exactly where they left off.
 */
export async function cancelPropertySubscriptionAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgOwner()
  const propertyId = String(formData.get('property_id') ?? '')
  if (!propertyId) return { error: 'Missing property.' }

  const admin = createAdminClient()
  const { data: sub, error: subErr } = await admin
    .from('billing_subscriptions')
    .select('stripe_subscription_id, status, org_id, cancel_at_period_end')
    .eq('property_id', propertyId)
    .maybeSingle()
  if (subErr) return { error: subErr.message }
  if (!sub?.stripe_subscription_id || sub.org_id !== session.organization.id) {
    return { error: 'Subscription not found for this property.' }
  }
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
    return { error: 'This subscription has already ended.' }
  }
  if (sub.cancel_at_period_end) {
    return { error: 'Cancellation is already scheduled.' }
  }

  let updated
  try {
    updated = await stripe().subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
    })
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Stripe rejected the cancellation; try again.',
    }
  }
  await syncSubscriptionToDb(propertyId, sub.org_id, updated)

  const endDate = updated.items.data[0]?.current_period_end
    ? new Date(updated.items.data[0].current_period_end * 1000).toLocaleDateString()
    : 'the period end'
  revalidatePath('/billing')
  return {
    success: `Cancellation scheduled. Access continues until ${endDate}.`,
  }
}

/**
 * Abort a pending cancellation. Flips `cancel_at_period_end` back to
 * false; the subscription resumes its normal renewal cycle. Idempotent
 * for the "not currently scheduled" case (returns an error explaining
 * there's nothing to abort).
 */
export async function resumeSubscriptionAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgOwner()
  const propertyId = String(formData.get('property_id') ?? '')
  if (!propertyId) return { error: 'Missing property.' }

  const admin = createAdminClient()
  const { data: sub, error: subErr } = await admin
    .from('billing_subscriptions')
    .select('stripe_subscription_id, status, org_id, cancel_at_period_end')
    .eq('property_id', propertyId)
    .maybeSingle()
  if (subErr) return { error: subErr.message }
  if (!sub?.stripe_subscription_id || sub.org_id !== session.organization.id) {
    return { error: 'Subscription not found for this property.' }
  }
  if (!sub.cancel_at_period_end) {
    return { error: 'This subscription is not scheduled for cancellation.' }
  }
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
    // Cancellation already took effect — too late to abort. The caller
    // should use resubscribePropertyAction to create a fresh sub.
    return {
      error:
        'This subscription has already ended. Use Resubscribe to start a new one.',
    }
  }

  let updated
  try {
    updated = await stripe().subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: false,
    })
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : 'Stripe rejected the resume; try again.',
    }
  }
  await syncSubscriptionToDb(propertyId, sub.org_id, updated)

  revalidatePath('/billing')
  return { success: 'Cancellation aborted — subscription continues.' }
}

/**
 * Start a fresh subscription for a property whose previous one has
 * already ended (status=canceled or incomplete_expired). Delegates to
 * {@link startSubscriptionForProperty}, which is idempotent and creates
 * a new Stripe subscription scoped to the same property_id. The
 * customer keeps their card on file (Stripe Customer wallet survives
 * subscription cancellation), so resubscribing is a one-click action —
 * no card re-entry required.
 *
 * If the existing sub is still in a non-terminal state, this returns
 * the existing-subscription kind without creating a duplicate.
 */
export async function resubscribePropertyAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgOwner()
  const propertyId = String(formData.get('property_id') ?? '')
  if (!propertyId) return { error: 'Missing property.' }

  const admin = createAdminClient()
  const { data: property, error: propErr } = await admin
    .from('properties')
    .select('id, org_id')
    .eq('id', propertyId)
    .maybeSingle()
  if (propErr) return { error: propErr.message }
  if (!property || property.org_id !== session.organization.id) {
    return { error: 'Property not found.' }
  }

  // Prefer reusing the card that was on the property's PREVIOUS sub so
  // the customer doesn't have to re-pick. resolveResubscribePaymentMethod
  // validates that the PM is still attached to the org's Customer; if
  // it's been detached we fall back to send_invoice + 14-day grace.
  const customerId = await getStripeCustomerForOrg(property.org_id)
  const priorPmId = customerId
    ? await resolveResubscribePaymentMethod(propertyId, customerId)
    : null

  let result
  try {
    result = await startSubscriptionForProperty(propertyId, {
      defaultPaymentMethodId: priorPmId ?? undefined,
    })
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to resubscribe.',
    }
  }

  revalidatePath('/billing')
  if (result.kind === 'existing') {
    return {
      success: 'A subscription was already active; nothing to do.',
    }
  }
  return {
    success: priorPmId
      ? 'Resubscribed. Your previous card has been charged for the new period.'
      : 'Resubscribed. An invoice was emailed — pay it within 14 days or attach a card from the row above to auto-charge.',
  }
}

const NAME_MAX = 200
const ADDRESS_FIELD_MAX = 200
// Stripe stores the address on the Customer; we mirror its field names
// (line1/line2/city/state/postal_code/country) so the wire format is
// transparent and the form posts straight through.
const ADDRESS_FIELDS = [
  'line1',
  'line2',
  'city',
  'state',
  'postal_code',
  'country',
] as const

/**
 * Save the org's billing identity on the Stripe Customer (the same data
 * that Stripe prints on invoices and uses to send receipts and dunning
 * emails). Replaces the old "Open Stripe billing portal" entry point so
 * customers can edit their billing email/address without leaving the
 * app.
 *
 * Owner-only. Email is required because Stripe sends payment failure
 * notices there; everything else can be cleared by submitting an empty
 * value (we send `null` for cleared fields so Stripe drops them rather
 * than storing the empty string).
 *
 * Note: this only updates the Stripe Customer. The user's app-account
 * email lives in Supabase auth and is changed from /account; the two
 * are deliberately separate so a manager can use a personal login while
 * billing receipts go to accounting@.
 */
export async function updateBillingDetailsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgOwner()
  const customerId = await getStripeCustomerForOrg(session.organization.id)
  if (!customerId) {
    return {
      error:
        'No Stripe customer for this org yet. Start a property subscription first.',
    }
  }

  const email = String(formData.get('email') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  if (!email) return { error: 'Billing email is required.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Enter a valid billing email address.' }
  }
  if (name.length > NAME_MAX) {
    return { error: `Company name is too long (${NAME_MAX} characters max).` }
  }

  const address: Record<string, string | null> = {}
  for (const field of ADDRESS_FIELDS) {
    const value = String(formData.get(`address.${field}`) ?? '').trim()
    if (value.length > ADDRESS_FIELD_MAX) {
      return {
        error: `${field.replace('_', ' ')} is too long (${ADDRESS_FIELD_MAX} characters max).`,
      }
    }
    address[field] = value || null
  }
  if (address.country) {
    if (!/^[A-Za-z]{2}$/.test(address.country)) {
      return { error: 'Country must be a 2-letter ISO code (e.g. US).' }
    }
    address.country = address.country.toUpperCase()
  }

  try {
    await stripe().customers.update(customerId, {
      email,
      name: name || undefined,
      // When every address field is null, send `address: null` so Stripe
      // clears the prior address rather than complaining about an empty
      // object.
      address: Object.values(address).some((v) => v) ? address : null,
    })
  } catch (err) {
    console.error('[billing] customers.update failed', err)
    return {
      error:
        err instanceof Error
          ? err.message
          : "Couldn't save billing details. Try again.",
    }
  }

  revalidatePath('/billing')
  return { success: 'Billing details updated.' }
}

// ----------------------------------------------------------------------------
// Re-sync from Stripe — recovery path when a billing row is out of date
//
// Walks every Subscription on the org's Stripe Customer and re-mirrors
// each one through syncSubscriptionToDb. Use when a property shows
// "Not Started" but Stripe has it active (webhook missed an event,
// migration race, etc.). Owner-only.
// ----------------------------------------------------------------------------
export async function resyncSubscriptionsAction(): Promise<ActionResult> {
  const session = await requireOrgOwner()
  const customerId = await getStripeCustomerForOrg(session.organization.id)
  if (!customerId) {
    return { error: 'This org has no Stripe customer yet.' }
  }

  // Preload the org's properties once so we can do name-based recovery
  // for subscriptions whose metadata.property_id is missing or stale.
  const admin = createAdminClient()
  const { data: propertyRows } = await admin
    .from('properties')
    .select('id, slug, name')
    .eq('org_id', session.organization.id)
  type PropertyRow = { id: string; slug: string; name: string }
  const properties = (propertyRows ?? []) as PropertyRow[]
  const propertyIds = new Set(properties.map((p) => p.id))
  const propertyBySlug = new Map(properties.map((p) => [p.slug, p]))
  const propertyByLowerName = new Map(
    properties.map((p) => [p.name.toLowerCase(), p]),
  )

  const stripeClient = stripe()
  const lines: string[] = []
  let mirrored = 0
  let skipped = 0

  for await (const sub of stripeClient.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
  })) {
    const propertyIdFromMeta =
      (sub.metadata?.property_id as string | undefined) ?? null
    const propertySlugFromMeta =
      (sub.metadata?.property_slug as string | undefined) ?? null
    const orgIdFromMeta =
      (sub.metadata?.org_id as string | undefined) ?? null
    const description = sub.description ?? ''
    const label = description || sub.id

    if (orgIdFromMeta && orgIdFromMeta !== session.organization.id) {
      lines.push(`${label}: skipped — belongs to a different org`)
      skipped += 1
      continue
    }

    // Resolution order:
    //  1. metadata.property_id, if it matches one of our properties
    //  2. metadata.property_slug → property lookup
    //  3. description-based match: "HotelOps subscription — <Property name>"
    //     This covers the case where a Stripe sub was created without
    //     metadata (older flow) or had its property_id stripped.
    let resolved =
      propertyIdFromMeta && propertyIds.has(propertyIdFromMeta)
        ? properties.find((p) => p.id === propertyIdFromMeta) ?? null
        : null
    if (!resolved && propertySlugFromMeta) {
      resolved = propertyBySlug.get(propertySlugFromMeta) ?? null
    }
    if (!resolved && description.startsWith('HotelOps subscription — ')) {
      const name = description
        .slice('HotelOps subscription — '.length)
        .trim()
        .toLowerCase()
      resolved = propertyByLowerName.get(name) ?? null
    }

    if (!resolved) {
      const reason = propertyIdFromMeta
        ? `metadata.property_id ${propertyIdFromMeta} doesn't match any property`
        : 'no property_id in metadata and description didn’t match a property name'
      lines.push(`${label}: skipped — ${reason}`)
      skipped += 1
      continue
    }

    // If we resolved by slug or name (not metadata.property_id), patch
    // the Stripe sub's metadata so the next webhook event arrives
    // routable without falling through this recovery path again.
    if (!propertyIdFromMeta || propertyIdFromMeta !== resolved.id) {
      try {
        await stripeClient.subscriptions.update(sub.id, {
          metadata: {
            ...sub.metadata,
            property_id: resolved.id,
            property_slug: resolved.slug,
            org_id: session.organization.id,
            app: 'hotelops',
          },
        })
      } catch (err) {
        console.warn(
          '[billing] resync: metadata heal failed',
          sub.id,
          err instanceof Error ? err.message : err,
        )
      }
    }

    try {
      await syncSubscriptionToDb(resolved.id, session.organization.id, sub)
      mirrored += 1
      lines.push(`${label}: synced → ${resolved.name}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'sync failed'
      lines.push(`${label}: skipped — ${message}`)
      skipped += 1
    }
  }

  revalidatePath('/billing')
  return {
    success: `Re-synced ${mirrored} subscription${
      mirrored === 1 ? '' : 's'
    }${skipped > 0 ? ` (${skipped} skipped)` : ''}.${
      lines.length > 0 ? ` ${lines.join(' · ')}` : ''
    }`,
  }
}

// ----------------------------------------------------------------------------
// Add-on subscription items
//
// Operator-driven, no feature gates yet: every property can use signage and
// arrival regardless of which line items are on the subscription. Toggling
// here adds/removes the corresponding Stripe SubscriptionItem on the
// per-property subscription so the next invoice picks it up (prorated).
// See docs/pricing.md for the canonical pricing structure.
// ----------------------------------------------------------------------------

function isAddonKey(value: string): value is AddonKey {
  return value in ADDONS
}

export async function addAddonAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgOwner()
  const propertyId = String(formData.get('property_id') ?? '')
  const addonKey = String(formData.get('addon_key') ?? '')
  if (!propertyId || !isAddonKey(addonKey)) {
    return { error: 'Missing property or add-on.' }
  }

  // Defense-in-depth: confirm the property is in the caller's org. The
  // Stripe helper will also fail to find a subscription if the row
  // doesn't exist, but a wrong-org check here gives a friendlier error
  // and avoids leaking the existence of another tenant's property.
  const admin = createAdminClient()
  const { data: property } = await admin
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!property) return { error: 'Property not found in your organization.' }

  const result = await addAddonToProperty(propertyId, addonKey)
  if (!result.ok) return { error: result.error }

  revalidatePath('/billing')
  return { success: `${ADDONS[addonKey].label} added.` }
}

export async function removeAddonAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireOrgOwner()
  const propertyId = String(formData.get('property_id') ?? '')
  const addonKey = String(formData.get('addon_key') ?? '')
  if (!propertyId || !isAddonKey(addonKey)) {
    return { error: 'Missing property or add-on.' }
  }

  const admin = createAdminClient()
  const { data: property } = await admin
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!property) return { error: 'Property not found in your organization.' }

  const result = await removeAddonFromProperty(propertyId, addonKey)
  if (!result.ok) return { error: result.error }

  revalidatePath('/billing')
  return { success: `${ADDONS[addonKey].label} removed.` }
}
