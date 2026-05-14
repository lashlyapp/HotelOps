import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ArrivalPage,
  ArrivalSection,
  ItNetwork,
} from '@/lib/supabase/types'
import {
  deletePageAction,
  deleteSectionAction,
  ensureArrivalPageAction,
  reorderSectionAction,
} from '../actions'
import { SECTION_KIND_LABELS } from '../_lib/labels'
import { AddSectionForm } from '../_components/add-section-form'
import { arrivalPublicUrl } from '../_components/arrival-url'
import { PageForm } from '../_components/page-form'
import { PublishBar } from '../_components/publish-bar'

export default async function ArrivalBuilderPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  const { propertyId } = await params
  const session = await requireOrgUser()
  const property = session.properties.find((p) => p.id === propertyId)
  if (!property) notFound()
  const isOwner = session.profile.role === 'org_owner'

  // Auto-create the arrival_pages row on first visit so we don't make
  // operators click through a separate "Create" button. The action is
  // idempotent — returns the existing page id on subsequent visits.
  const ensured = await ensureArrivalPageAction({ propertyId })
  if (!ensured.ok) {
    return (
      <div className="p-4 sm:p-8">
        <Card>
          <CardBody className="text-sm text-danger-fg">{ensured.error}</CardBody>
        </Card>
      </div>
    )
  }

  const admin = createAdminClient()
  const [{ data: pageRow }, { data: sectionRows }, { data: networkRows }] =
    await Promise.all([
      admin
        .from('arrival_pages')
        .select('*')
        .eq('id', ensured.pageId)
        .maybeSingle(),
      admin
        .from('arrival_sections')
        .select('*')
        .eq('page_id', ensured.pageId)
        .order('sort_order', { ascending: true }),
      admin
        .from('it_networks')
        .select('*')
        .eq('property_id', propertyId)
        .eq('is_shareable', true)
        .order('label', { ascending: true }),
    ])
  if (!pageRow) notFound()
  const page = pageRow as ArrivalPage
  const sections = (sectionRows ?? []) as ArrivalSection[]
  const networks = (networkRows ?? []) as ItNetwork[]

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/arrival"
            className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
          >
            ← Back to arrival
          </Link>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-fg">
            {property.name}
          </h2>
          <p className="mt-1 text-xs text-subtle">
            Public URL:{' '}
            <a
              href={arrivalPublicUrl(page.public_slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring rounded-sm font-mono text-fg underline"
            >
              {arrivalPublicUrl(page.public_slug)}
            </a>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/arrival/${property.id}/print`}
            className="focus-ring inline-flex h-9 items-center rounded-md border border-border-default px-3 text-sm font-medium text-fg hover:bg-surface-muted"
          >
            Printable QR card
          </Link>
          <Link
            href={arrivalPublicUrl(page.public_slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring inline-flex h-9 items-center rounded-md border border-border-default px-3 text-sm font-medium text-fg hover:bg-surface-muted"
          >
            Preview
          </Link>
        </div>
      </div>

      <PublishBar page={page} />

      <Card>
        <CardHeader>
          <CardTitle>Page details</CardTitle>
        </CardHeader>
        <CardBody>
          <PageForm
            propertyId={property.id}
            page={page}
            networks={networks}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sections ({sections.length})</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {sections.length === 0 ? (
            <p className="text-sm text-muted">
              No sections yet. Add one below to start displaying dining
              hours, gym info, a menu, or marketing content.
            </p>
          ) : (
            <ul className="space-y-2">
              {sections.map((s, idx) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">
                      {s.title}{' '}
                      <span className="ml-1 text-xs text-subtle">
                        · {SECTION_KIND_LABELS[s.kind]}
                      </span>
                    </p>
                    {!s.is_published ? (
                      <Badge tone="neutral">Hidden</Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/arrival/${property.id}/sections/${s.id}`}
                      className="focus-ring rounded-sm px-2 py-1 text-xs font-medium text-fg hover:bg-surface-muted"
                    >
                      Edit
                    </Link>
                    <form action={reorderSectionAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        disabled={idx === 0}
                        className="focus-ring rounded-sm px-2 py-1 text-xs text-muted hover:bg-surface-muted hover:text-fg disabled:opacity-30"
                      >
                        ↑
                      </button>
                    </form>
                    <form action={reorderSectionAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        disabled={idx === sections.length - 1}
                        className="focus-ring rounded-sm px-2 py-1 text-xs text-muted hover:bg-surface-muted hover:text-fg disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </form>
                    <form action={deleteSectionAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <button
                        type="submit"
                        className="focus-ring rounded-sm px-2 py-1 text-xs text-muted hover:text-danger-fg"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-border-subtle pt-3">
            <h4 className="mb-2 text-sm font-semibold text-fg">
              Add a section
            </h4>
            <AddSectionForm pageId={page.id} />
          </div>
        </CardBody>
      </Card>

      {isOwner ? (
        <Card>
          <CardBody>
            <form action={deletePageAction}>
              <input type="hidden" name="id" value={page.id} />
              <button
                type="submit"
                className="focus-ring rounded-sm text-sm font-medium text-danger-fg hover:underline"
              >
                Delete arrival page
              </button>
            </form>
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
