/**
 * Constants and helpers for the self-serve, no-credit-card trial that
 * the /signup form provisions. The trial window is stored on
 * organizations.trial_ends_at — the migration only adds the columns,
 * everything else (length, storage cap, conversion behavior) lives
 * here so it can be tuned without a schema change.
 *
 * The billing gate (src/lib/billing/gate.ts) is the only consumer that
 * decides what to *do* with the trial state. This module is pure.
 */

/** Length of a fresh signup's free trial. */
export const TRIAL_DAYS = 7

/** Per-property storage quota during the trial (10 GB, matches the
 *  number we promise on /signup). On conversion to a paid plan we lift
 *  the property's storage_quota_bytes to the 25 GB base-plan default. */
export const TRIAL_STORAGE_BYTES = 10 * 1024 ** 3

/** Trial-state machine, computed from `organizations.trial_ends_at`
 *  plus the org's subscription presence. The gate maps these to banner
 *  copy and the write/media restrictions. */
export type TrialState =
  /** Not a self-serve trial org (admin-provisioned, or already converted). */
  | { kind: 'none' }
  /** Trial in progress; `daysLeft` is rounded up so "12h left" reads as 1 day. */
  | { kind: 'active'; endsAt: string; daysLeft: number }
  /** Trial window passed and no paid subscription yet — read-only. */
  | { kind: 'expired'; endedAt: string }

export function computeTrialState(
  trialEndsAt: string | null | undefined,
  now: Date = new Date(),
): TrialState {
  if (!trialEndsAt) return { kind: 'none' }
  const end = new Date(trialEndsAt).getTime()
  if (!Number.isFinite(end)) return { kind: 'none' }
  const diffMs = end - now.getTime()
  if (diffMs <= 0) return { kind: 'expired', endedAt: trialEndsAt }
  const daysLeft = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)))
  return { kind: 'active', endsAt: trialEndsAt, daysLeft }
}

/** Human banner copy keyed off the trial state. Used by the org-shell
 *  billing banner and the /billing page header. */
export function trialBannerMessage(state: TrialState): string | null {
  if (state.kind === 'active') {
    return `Trial: ${state.daysLeft} day${state.daysLeft === 1 ? '' : 's'} left. Add a payment method anytime — no charge until you do.`
  }
  if (state.kind === 'expired') {
    return 'Your free trial has ended. Add a payment method to keep editing — your data is safe.'
  }
  return null
}
