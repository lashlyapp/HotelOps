import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { requireSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { cn } from '@/lib/utils/cn'
import { SettingsForm } from '../_components/settings-form'
import type { PropertySocialSettings } from '@/lib/supabase/types'

type SearchParams = Promise<{ property?: string }>

export default async function SocialSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await requireSession()
  const { property: propertySlug } = await searchParams

  if (session.properties.length === 0) {
    return (
      <div className="p-4 sm:p-8 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Social settings
        </h1>
        <p className="mt-4 text-sm text-muted">
          No properties yet. Contact your admin to add one.
        </p>
      </div>
    )
  }

  const activeProperty =
    session.properties.find((p) => p.slug === propertySlug) ??
    session.properties[0]
  if (propertySlug !== activeProperty.slug) {
    redirect(`/social/settings?property=${activeProperty.slug}`)
  }

  const admin = createAdminClient()
  const { data: settings } = await admin
    .from('property_social_settings')
    .select('*')
    .eq('property_id', activeProperty.id)
    .maybeSingle()

  const typed = (settings as PropertySocialSettings | null) ?? null

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-2xl">
      <div>
        <Link
          href={`/social?property=${activeProperty.slug}`}
          className="focus-ring text-sm text-muted hover:text-fg"
        >
          ← Back to today&apos;s post
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">
          Social settings
        </h1>
        <p className="mt-1 text-sm text-muted">
          Tune the voice the generator writes in, store the OpenAI key it uses, and choose the hashtags it appends to every caption.
        </p>
      </div>

      {session.properties.length > 1 ? (
        <div className="flex flex-wrap gap-1 border-b border-border-subtle">
          {session.properties.map((p) => (
            <Link
              key={p.slug}
              href={`/social/settings?property=${p.slug}`}
              className={cn(
                'focus-ring -mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                p.slug === activeProperty.slug
                  ? 'border-fg text-fg'
                  : 'border-transparent text-muted hover:text-fg',
              )}
            >
              {p.name}
            </Link>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{activeProperty.name}</CardTitle>
        </CardHeader>
        <CardBody>
          <SettingsForm
            propertyId={activeProperty.id}
            initial={{
              brand_voice: typed?.brand_voice ?? 'warm',
              signature_hashtags: typed?.signature_hashtags ?? '',
              social_handles: typed?.social_handles ?? '',
              hasOpenAiKey: Boolean(typed?.openai_api_key_enc),
            }}
          />
        </CardBody>
      </Card>
    </div>
  )
}
