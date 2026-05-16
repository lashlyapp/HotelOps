import type { Organization } from '@/lib/supabase/types'
import type { AddonKey } from '@/lib/stripe/addon-config'

/**
 * Read whether an add-on is currently enabled at the org level.
 *
 * Single source of truth for soft gates across the operator UI — the
 * arrival Publish button and the signage screen-pair flow both consult
 * this so they can render a clear in-app upgrade CTA when the customer
 * tries to use a feature their plan doesn't cover.
 *
 * Server- and client-safe. Reads only the org row (already loaded by
 * `requireOrgUser`) so no extra DB / Stripe calls.
 */
export function hasAddon(
  organization: Pick<
    Organization,
    | 'signage_unlimited_addon_active'
    | 'guest_experience_addon_active'
    | 'social_studio_addon_active'
  >,
  addonKey: AddonKey,
): boolean {
  switch (addonKey) {
    case 'signage_unlimited':
      return Boolean(organization.signage_unlimited_addon_active)
    case 'guest_experience':
      return Boolean(organization.guest_experience_addon_active)
    case 'social_studio':
      return Boolean(organization.social_studio_addon_active)
  }
}
