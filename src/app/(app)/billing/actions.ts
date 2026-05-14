'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgOwner } from '@/lib/auth/session'
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
