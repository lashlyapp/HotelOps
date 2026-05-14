import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatBytes } from '@/lib/r2/stats'
import type { ItDocument, ItDocumentFolder } from '@/lib/supabase/types'
import { Disclosure } from '../_components/disclosure'
import { DeleteButton } from '../_components/delete-button'
import { DOCUMENT_CATEGORY_LABELS } from '../_lib/labels'
import { deleteDocumentAction } from './actions'
import { DownloadButton } from './_components/download-button'
import { EditDocumentForm } from './_components/edit-form'
import { FolderTile } from './_components/folder-tile'
import { NewFolderButton } from './_components/new-folder'
import { UploadDocumentForm } from './_components/upload-form'

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; category?: string }>
}) {
  const session = await requireOrgUser()
  const sp = await searchParams
  const categoryFilter =
    sp.category && sp.category in DOCUMENT_CATEGORY_LABELS
      ? (sp.category as keyof typeof DOCUMENT_CATEGORY_LABELS)
      : null
  const requestedFolderId = sp.folder?.trim() || null

  const admin = createAdminClient()

  // Pull every folder for the org up front — we use them for the breadcrumb,
  // for child folder rendering, and for the move-to picker in edit forms.
  // It's a few hundred rows at most; cheaper than chained queries.
  const { data: folderRows } = await admin
    .from('it_document_folders')
    .select('*')
    .eq('org_id', session.organization.id)
    .order('name', { ascending: true })
  const folders = (folderRows ?? []) as ItDocumentFolder[]
  const foldersById = new Map(folders.map((f) => [f.id, f]))

  // Validate the folder id from the URL belongs to this org; fall back to
  // root if not. (Avoids leaking 404s and keeps state recoverable.)
  const currentFolder: ItDocumentFolder | null =
    requestedFolderId && foldersById.has(requestedFolderId)
      ? foldersById.get(requestedFolderId)!
      : null

  // Two view modes: folder browse (default) or category filter (flat list of
  // every doc in that category, regardless of folder).
  const browsing = categoryFilter === null

  // Fetch documents for the current view. We always fetch the docs we'll
  // display in the table plus a separate count query for folder tile badges.
  let docsQuery = admin
    .from('it_documents')
    .select('*')
    .eq('org_id', session.organization.id)
    .order('title', { ascending: true })
  if (browsing) {
    docsQuery = currentFolder
      ? docsQuery.eq('folder_id', currentFolder.id)
      : docsQuery.is('folder_id', null)
  } else {
    docsQuery = docsQuery.eq('category', categoryFilter!)
  }
  const { data: docRows } = await docsQuery
  const documents = (docRows ?? []) as ItDocument[]

  // Counts per folder (for tile badges) and per category (for filter chips).
  const { data: countRows } = await admin
    .from('it_documents')
    .select('folder_id, category')
    .eq('org_id', session.organization.id)
  const folderDocCounts = new Map<string, number>()
  const categoryCounts = new Map<string, number>()
  let totalDocs = 0
  for (const row of countRows ?? []) {
    totalDocs++
    if (row.folder_id) {
      folderDocCounts.set(
        row.folder_id,
        (folderDocCounts.get(row.folder_id) ?? 0) + 1,
      )
    }
    if (row.category) {
      categoryCounts.set(
        row.category,
        (categoryCounts.get(row.category) ?? 0) + 1,
      )
    }
  }
  const childFolderCounts = new Map<string | null, number>()
  for (const f of folders) {
    childFolderCounts.set(
      f.parent_id,
      (childFolderCounts.get(f.parent_id) ?? 0) + 1,
    )
  }

  const childFolders = folders.filter(
    (f) => f.parent_id === (currentFolder?.id ?? null),
  )
  const propertyById = new Map(session.properties.map((p) => [p.id, p]))
  const breadcrumb = buildBreadcrumb(currentFolder, foldersById)

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
          warranties — organized in folders, stored privately, downloaded only
          by your team.
        </p>
      </div>

      <CategoryChips
        active={categoryFilter}
        counts={categoryCounts}
        total={totalDocs}
      />

      {browsing ? (
        <>
          <Breadcrumb crumbs={breadcrumb} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-subtle">
              {childFolders.length > 0
                ? `${childFolders.length} ${
                    childFolders.length === 1 ? 'folder' : 'folders'
                  } · `
                : ''}
              {documents.length} {documents.length === 1 ? 'doc' : 'docs'} in{' '}
              <span className="text-fg">
                {currentFolder ? currentFolder.name : 'Documents'}
              </span>
            </p>
            <NewFolderButton parentId={currentFolder?.id ?? null} />
          </div>

          {childFolders.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {childFolders.map((f) => (
                <FolderTile
                  key={f.id}
                  id={f.id}
                  name={f.name}
                  docCount={folderDocCounts.get(f.id) ?? 0}
                  childFolderCount={childFolderCounts.get(f.id) ?? 0}
                  hrefIn={`/it-hub/documents?folder=${f.id}`}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <Card>
          <CardBody className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Showing every document in{' '}
              <span className="text-fg">
                {DOCUMENT_CATEGORY_LABELS[categoryFilter!]}
              </span>{' '}
              across all folders.
            </p>
            <a
              href="/it-hub/documents"
              className="focus-ring rounded-md text-xs font-medium text-muted hover:text-fg"
            >
              Back to folders
            </a>
          </CardBody>
        </Card>
      )}

      {documents.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-muted">
            {!browsing ? (
              <>No documents in this category yet.</>
            ) : currentFolder ? (
              <>This folder is empty. Drop files below to fill it.</>
            ) : childFolders.length > 0 ? (
              <>No loose files. Open a folder to see what&rsquo;s inside.</>
            ) : (
              <>
                No documents yet. Start with the contracts you&rsquo;d need to
                find fast — your ISP agreement, your PMS contract, and the
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
              const folder = d.folder_id ? foldersById.get(d.folder_id) : null
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
                        {!browsing && folder ? (
                          <>
                            <a
                              href={`/it-hub/documents?folder=${folder.id}`}
                              className="focus-ring rounded-sm text-muted hover:text-fg"
                            >
                              {folder.name}
                            </a>{' '}
                            ·{' '}
                          </>
                        ) : null}
                        {prop ? prop.name : 'All properties'} ·{' '}
                        <span title={d.file_name}>{d.file_name}</span> ·{' '}
                        {formatBytes(d.size_bytes)}
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
                          <EditDocumentForm document={d} folders={folders} />
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
          <CardTitle>
            Upload to{' '}
            <span className="text-muted">
              {currentFolder ? currentFolder.name : 'Documents'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <Disclosure buttonLabel="Upload document">
            <UploadDocumentForm
              properties={session.properties}
              folders={folders}
              currentFolderId={currentFolder?.id ?? null}
            />
          </Disclosure>
        </CardBody>
      </Card>
    </div>
  )
}

function buildBreadcrumb(
  current: ItDocumentFolder | null,
  byId: Map<string, ItDocumentFolder>,
): { id: string | null; name: string }[] {
  const trail: { id: string | null; name: string }[] = [
    { id: null, name: 'Documents' },
  ]
  if (!current) return trail
  const chain: ItDocumentFolder[] = []
  let cursor: ItDocumentFolder | undefined = current
  // Cycle-safe: cap depth so a corrupted parent chain can't loop forever.
  for (let i = 0; cursor && i < 64; i++) {
    chain.unshift(cursor)
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined
  }
  for (const f of chain) trail.push({ id: f.id, name: f.name })
  return trail
}

function Breadcrumb({
  crumbs,
}: {
  crumbs: { id: string | null; name: string }[]
}) {
  return (
    <nav aria-label="Folder breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        return (
          <span key={c.id ?? 'root'} className="flex items-center gap-1">
            {last ? (
              <span className="font-medium text-fg">{c.name}</span>
            ) : (
              <a
                href={
                  c.id ? `/it-hub/documents?folder=${c.id}` : '/it-hub/documents'
                }
                className="focus-ring rounded-sm text-muted hover:text-fg"
              >
                {c.name}
              </a>
            )}
            {!last ? <span className="text-subtle">/</span> : null}
          </span>
        )
      })}
    </nav>
  )
}

function CategoryChips({
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
        Folders ({total})
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
