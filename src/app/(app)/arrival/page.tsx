import Link from 'next/link'
import { Card, CardBody } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ArrivalPage } from '@/lib/supabase/types'

export default async function ArrivalListPage() {
  const session = await requireOrgUser()
  const admin = createAdminClient()
  const { data } = await admin
    .from('arrival_pages')
    .select('id, property_id, public_slug, published_at, updated_at')
    .eq('org_id', session.organization.id)
  const byProperty = new Map<string, ArrivalPage>()
  for (const row of (data ?? []) as ArrivalPage[]) {
    byProperty.set(row.property_id, row)
  }

  if (session.properties.length === 0) {
    return (
      <div className="p-4 sm:p-8">
        <Card>
          <CardBody className="text-sm text-muted">
            Add a property first, then come back to build its arrival page.
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 space-y-5 max-w-3xl">
      <ul className="space-y-3">
        {session.properties.map((p) => {
          const page = byProperty.get(p.id)
          return (
            <li key={p.id}>
              <Card>
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">{p.name}</p>
                    <p className="text-xs text-muted">
                      {page
                        ? page.published_at
                          ? `Published · /a/${page.public_slug}`
                          : `Draft · /a/${page.public_slug}`
                        : 'Not set up yet'}
                    </p>
                  </div>
                  <Link
                    href={`/arrival/${p.id}`}
                    className="focus-ring inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-fg hover:bg-primary-hover"
                  >
                    {page ? 'Edit' : 'Set up'}
                  </Link>
                </CardBody>
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
