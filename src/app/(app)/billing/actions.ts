'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgOwner } from '@/lib/auth/session'
import { stripe } from '@/lib/stripe/client'
import {
  getStripeCustomerForOrg,
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

  let updated
  try {
    updated = await stripe().subscriptions.update(sub.stripe_subscription_id, {
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

  // Mirror immediately so the UI reflects the new card without waiting
  // for the customer.subscription.updated webhook. The webhook will fire
  // shortly and re-sync; both writes are idempotent.
  await syncSubscriptionToDb(propertyId, sub.org_id, updated, {
    paymentMethodDueAt: null,
  })

  revalidatePath('/billing')
  return { success: 'Card updated.' }
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
