import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOrgOwner } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Property } from '@/lib/supabase/types'
import { LogoSection } from './_components/logo-section'
import { PropertyDetailsForm } from './_components/property-details-form'

export default async function PropertyEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireOrgOwner()
  const { id } = await params

  const admin = createAdminClient()
  const { data } = await admin
    .from('properties')
    .select('*')
    .eq('id', id)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!data) notFound()
  const property = data as Property

  return (
    <div className="p-4 sm:p-8 max-w-3xl space-y-6">
      <div>
        <Link
          href="/properties"
          className="focus-ring rounded-sm text-xs font-medium text-muted hover:text-fg"
        >
          ← Properties
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">
          {property.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Update the address, contact info, and branding shown on your website
          or shared with guests.
        </p>
      </div>

      <LogoSection
        propertyId={property.id}
        propertyName={property.name}
        logoKey={property.logo_key}
        logoUploadedAt={property.logo_uploaded_at}
      />

      <PropertyDetailsForm property={property} />
    </div>
  )
}
