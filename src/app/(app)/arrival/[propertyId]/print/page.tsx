import Image from 'next/image'
import { notFound } from 'next/navigation'
import { requireOrgUser } from '@/lib/auth/session'
import { r2PublicUrl } from '@/lib/r2/client'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ArrivalPage } from '@/lib/supabase/types'
import { arrivalPublicUrl } from '../../_components/arrival-url'

// Render a single 8.5×11 page the operator hits Cmd+P on. Browser-native
// print dialog; no server-side PDF. CSS print rules hide the toolbar
// when the dialog opens.
export default async function PrintQrPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  const { propertyId } = await params
  const session = await requireOrgUser()
  const property = session.properties.find((p) => p.id === propertyId)
  if (!property) notFound()
  const admin = createAdminClient()
  const { data } = await admin
    .from('arrival_pages')
    .select('*')
    .eq('property_id', propertyId)
    .eq('org_id', session.organization.id)
    .maybeSingle()
  if (!data) notFound()
  const page = data as ArrivalPage
  const url = arrivalPublicUrl(page.public_slug)
  const qrSrc = `/api/arrival/qr/${encodeURIComponent(page.public_slug)}?size=1024`

  return (
    <>
      <style>{`
        @page { size: letter; margin: 0.5in; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="no-print mx-auto max-w-3xl space-y-3 p-4 sm:p-8">
        <p className="text-xs text-muted">
          Hit Cmd/Ctrl + P to print on cardstock. Drop one in each room.
        </p>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col items-center justify-center px-6 py-10 print:py-0">
        <div className="w-full rounded-xl border border-slate-300 bg-white p-10 text-center shadow-sm print:border-0 print:shadow-none">
          {property.logo_key ? (
            <Image
              src={r2PublicUrl(property.logo_key)}
              alt=""
              width={200}
              height={60}
              unoptimized
              className="mx-auto mb-4 h-12 w-auto object-contain"
            />
          ) : null}
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Welcome to
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            {property.name}
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            Scan for Wi-Fi, dining, and what to do nearby.
          </p>

          <div className="mt-8 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt={`QR code for ${url}`}
              width={420}
              height={420}
              className="h-[420px] w-[420px]"
            />
          </div>

          <p className="mt-6 text-xs text-slate-500">
            Or visit:{' '}
            <span className="font-mono text-slate-900">{url}</span>
          </p>

          <div className="mt-10 border-t border-dashed border-slate-200 pt-3 text-[10px] uppercase tracking-wider text-slate-400">
            Room #{' '}
            <span className="ml-2 inline-block min-w-[6rem] border-b border-slate-300">
              &nbsp;
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
