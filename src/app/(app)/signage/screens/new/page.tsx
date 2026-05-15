import Link from 'next/link'
import { UpgradePrompt } from '@/components/billing/upgrade-prompt'
import { Card, CardBody } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { hasAddon } from '@/lib/billing/has-addon'
import { createAdminClient } from '@/lib/supabase/admin'
import { SIGNAGE_BASE_SCREEN_LIMIT } from '../../_lib/labels'
import { pairEntryUrl } from '../../_lib/player-url'
import { NewScreenForm } from './new-screen-form'

export default async function NewScreenPage() {
  const session = await requireOrgUser()
  const isOwner = session.profile.role === 'org_owner'
  const hasUnlimited = hasAddon(session.organization, 'signage_unlimited')

  // Compute per-property screen counts so we can tell the form which
  // properties are at the base-plan cap. Done here (server) rather than
  // on submit so the operator sees the gate before they pick a property,
  // not after they fill out the whole form and click Generate.
  const admin = createAdminClient()
  const { data: countsRows } = await admin
    .from('signage_screens')
    .select('property_id')
    .eq('org_id', session.organization.id)
  const screenCounts = new Map<string, number>()
  for (const row of countsRows ?? []) {
    screenCounts.set(
      row.property_id,
      (screenCounts.get(row.property_id) ?? 0) + 1,
    )
  }

  const atCapProperties = session.properties.filter(
    (p) => (screenCounts.get(p.id) ?? 0) >= SIGNAGE_BASE_SCREEN_LIMIT,
  )
  const showUpgrade = !hasUnlimited && atCapProperties.length > 0

  return (
    <div className="p-4 sm:p-8 space-y-5 max-w-3xl">
      <div>
        <Link
          href="/signage"
          className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
        >
          ← Back to screens
        </Link>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-fg">
          Pair a new screen
        </h2>
        <p className="mt-1 text-sm text-muted">
          Give the screen a name and the property it lives in. You&apos;ll
          get a 6-digit code valid for 10 minutes.
          {!hasUnlimited ? (
            <>
              {' '}
              Your base plan includes {SIGNAGE_BASE_SCREEN_LIMIT} screens per
              property.
            </>
          ) : null}
        </p>
      </div>

      {showUpgrade ? (
        <UpgradePrompt
          addonKey="signage_unlimited"
          propertyCount={session.properties.length}
          isOwner={isOwner}
          reason={`${atCapProperties.map((p) => p.name).join(', ')} ${atCapProperties.length === 1 ? 'has' : 'have'} already hit the ${SIGNAGE_BASE_SCREEN_LIMIT}-screen cap. Enable Signage Unlimited to keep adding screens at every property.`}
        />
      ) : null}

      <Card>
        <CardBody>
          <NewScreenForm
            properties={session.properties}
            atCapPropertyIds={
              hasUnlimited ? [] : atCapProperties.map((p) => p.id)
            }
            baseLimit={SIGNAGE_BASE_SCREEN_LIMIT}
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-2 text-sm text-muted">
          <h3 className="text-sm font-medium text-fg">On the TV</h3>
          <ol className="list-decimal space-y-1 pl-5 text-xs">
            <li>
              Open the browser and go to{' '}
              <span className="font-mono text-fg">{pairEntryUrl()}</span>.
            </li>
            <li>Enter the 6-digit code shown after you create the screen.</li>
            <li>The TV will navigate to its player URL and stay there.</li>
          </ol>
        </CardBody>
      </Card>
    </div>
  )
}
