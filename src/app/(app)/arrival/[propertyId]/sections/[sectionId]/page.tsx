import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireOrgUser } from '@/lib/auth/session'
import { listMediaWithTags } from '@/lib/r2/list'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ArrivalInfoItem,
  ArrivalMenuGroup,
  ArrivalSection,
} from '@/lib/supabase/types'
import { SECTION_KIND_LABELS } from '../../../_lib/labels'
import { InfoEditor } from './info-editor'
import { MenuEditor } from './menu-editor'
import { SectionTitleForm } from './section-title-form'

export default async function SectionEditorPage({
  params,
}: {
  params: Promise<{ propertyId: string; sectionId: string }>
}) {
  const { propertyId, sectionId } = await params
  const session = await requireOrgUser()
  const property = session.properties.find((p) => p.id === propertyId)
  if (!property) notFound()

  const admin = createAdminClient()
  const { data: sectionRow } = await admin
    .from('arrival_sections')
    .select('*')
    .eq('id', sectionId)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!sectionRow) notFound()
  const section = sectionRow as ArrivalSection

  // Photo picker draws from the property's existing media library.
  const mediaFiles = await listMediaWithTags(property.id, property.r2_prefix)
  const photoFiles = mediaFiles.filter((f) =>
    (f.contentType ?? '').startsWith('image/'),
  )

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <div>
        <Link
          href={`/arrival/${property.id}`}
          className="focus-ring rounded-sm text-xs text-muted hover:text-fg"
        >
          ← Back to {property.name}
        </Link>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-fg">
          {section.title}{' '}
          <span className="ml-1 text-sm font-normal text-subtle">
            · {SECTION_KIND_LABELS[section.kind]}
          </span>
        </h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Section settings</CardTitle>
        </CardHeader>
        <CardBody>
          <SectionTitleForm
            id={section.id}
            title={section.title}
            isPublished={section.is_published}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Content</CardTitle>
        </CardHeader>
        <CardBody>
          {section.kind === 'menu' ? (
            <MenuEditor
              sectionId={section.id}
              groups={
                'groups' in section.body
                  ? (section.body as { groups: ArrivalMenuGroup[] }).groups
                  : []
              }
              photoFiles={photoFiles}
            />
          ) : (
            <InfoEditor
              sectionId={section.id}
              kind={section.kind}
              items={
                'items' in section.body
                  ? (section.body as { items: ArrivalInfoItem[] }).items
                  : []
              }
              photoFiles={photoFiles}
            />
          )}
        </CardBody>
      </Card>
    </div>
  )
}
