import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatBytes } from '@/lib/r2/stats'
import type { ItDocument } from '@/lib/supabase/types'
import { Disclosure } from '../_components/disclosure'
import { DeleteButton } from '../_components/delete-button'
import { DOCUMENT_CATEGORY_LABELS } from '../_lib/labels'
import { deleteDocumentAction } from './actions'
import { DownloadButton } from './_components/download-button'
import { EditDocumentForm } from './_components/edit-form'
import { UploadDocumentForm } from './_components/upload-form'

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const session = await requireOrgUser()
  const sp = await searchParams
  const filter = sp.category && sp.category in DOCUMENT_CATEGORY_LABELS
    ? (sp.category as keyof typeof DOCUMENT_CATEGORY_LABELS)
    : null

  const admin = createAdminClient()
  let query = admin
    .from('it_documents')
    .select('*')
    .eq('org_id', session.organization.id)
    .order('category', { ascending: true })
    .order('created_at', { ascending: false })
  if (filter) query = query.eq('category', filter)

  const { data } = await query
  const documents = (data ?? []) as ItDocument[]
  const propertyById = new Map(session.properties.map((p) => [p.id, p]))

  // Build counts for the filter chips so non-tech users can see what's where.
  const allDocsForCounts = filter
    ? (
        await admin
          .from('it_documents')
          .select('category')
          .eq('org_id', session.organization.id)
      ).data ?? []
    : documents.map((d) => ({ category: d.category }))
  const countsByCategory = new Map<string, number>()
  for (const d of allDocsForCounts) {
    countsByCategory.set(d.category, (countsByCategory.get(d.category) ?? 0) + 1)
  }

  const today = new Date()
  const soon = new Date(today)
  soon.setDate(today.getDate() + 30)

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-fg">
          Documents
        </h2>
        <p className="mt-1 text-sm text-muted">
          Contracts, runbooks, presentations, manuals, network diagrams, and
          warranties — uploaded once, found in seconds. Files are stored
          privately; only your team can download them.
        </p>
      </div>

      <FilterChips
        active={filter}
        counts={countsByCategory}
        total={
          (
            await admin
              .from('it_documents')
              .select('id', { count: 'exact', head: true })
              .eq('org_id', session.organization.id)
          ).count ?? 0
        }
      />

      {documents.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-muted">
            {filter ? (
              <>No documents in this category yet.</>
            ) : (
              <>
                No documents yet. Start with the contracts you’d need to find
                fast — your ISP agreement, your PMS contract, and the
                front-desk runbook.
              </>
            )}
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border-subtle">
            {documents.map((d) => {
              const prop = d.property_id ? propertyById.get(d.property_id) : null
              const expiry = d.expires_at ? new Date(d.expires_at) : null
              const expired = expiry && expiry < today
              const expiringSoon = expiry && expiry >= today && expiry <= soon
              return (
                <li key={d.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-fg truncate">
                          {d.title}
                        </p>
                        <Badge tone="info">
                          {DOCUMENT_CATEGORY_LABELS[d.category]}
                        </Badge>
                        {expired ? (
                          <Badge tone="danger">Expired</Badge>
                        ) : expiringSoon ? (
                          <Badge tone="warning">Expires soon</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-subtle">
                        {prop ? prop.name : 'All properties'} ·{' '}
                        <span title={d.file_name}>
                          {d.file_name}
                        </span>{' '}
                        · {formatBytes(d.size_bytes)}
                      </p>
                      <p className="mt-0.5 text-xs text-subtle">
                        Uploaded{' '}
                        {new Date(d.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                        {d.uploaded_by_email
                          ? ` by ${d.uploaded_by_email}`
                          : ''}
                        {expiry
                          ? ` · ${expired ? 'expired' : 'expires'} ${expiry.toLocaleDateString(
                              'en-US',
                              {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              },
                            )}`
                          : ''}
                      </p>
                      {d.notes ? (
                        <p className="mt-2 text-sm text-muted whitespace-pre-wrap">
                          {d.notes}
                        </p>
                      ) : null}

                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">
                          Edit details
                        </summary>
                        <div className="mt-3 max-w-xl">
                          <EditDocumentForm document={d} />
                        </div>
                      </details>
                    </div>

                    <div className="flex items-start gap-2">
                      <DownloadButton id={d.id} />
                      <DeleteButton
                        id={d.id}
                        action={deleteDocumentAction}
                        confirmMessage={`Delete "${d.title}"? This removes the file too.`}
                      />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Upload a document</CardTitle>
        </CardHeader>
        <CardBody>
          <Disclosure buttonLabel="Upload document">
            <UploadDocumentForm properties={session.properties} />
          </Disclosure>
        </CardBody>
      </Card>
    </div>
  )
}

function FilterChips({
  active,
  counts,
  total,
}: {
  active: keyof typeof DOCUMENT_CATEGORY_LABELS | null
  counts: Map<string, number>
  total: number
}) {
  const chips = (
    Object.entries(DOCUMENT_CATEGORY_LABELS) as [
      keyof typeof DOCUMENT_CATEGORY_LABELS,
      string,
    ][]
  ).filter(([cat]) => (counts.get(cat) ?? 0) > 0)
  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      <Chip href="/it-hub/documents" active={active === null}>
        All ({total})
      </Chip>
      {chips.map(([cat, label]) => (
        <Chip
          key={cat}
          href={`/it-hub/documents?category=${cat}`}
          active={active === cat}
        >
          {label} ({counts.get(cat) ?? 0})
        </Chip>
      ))}
    </div>
  )
}

function Chip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      className={
        active
          ? 'focus-ring rounded-full bg-fg px-3 py-1 text-xs font-medium text-bg'
          : 'focus-ring rounded-full border border-border-subtle px-3 py-1 text-xs text-muted hover:bg-surface-muted hover:text-fg'
      }
    >
      {children}
    </a>
  )
}
