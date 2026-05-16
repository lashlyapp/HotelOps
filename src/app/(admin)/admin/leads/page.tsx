import { requirePlatformAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Platform-admin view of guide-magnet leads. Read-only — the row
 * lifecycle is owned by the public lead-capture action and we do
 * not edit individual leads here. The list is small enough to
 * render fully on the server for now (single page, 200-row hard
 * cap); promote to client-side filtering/search when volume
 * crosses a couple hundred a month.
 */
export default async function AdminLeadsPage() {
  await requirePlatformAdmin()
  const leads = await loadLeads()

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Guide leads
        </h1>
        <p className="mt-1 text-sm text-muted">
          {leads.length === 0
            ? 'No guide downloads yet.'
            : `${leads.length} lead${leads.length === 1 ? '' : 's'}, newest first.`}
        </p>
      </div>

      {leads.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-border-subtle">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b border-border-subtle bg-surface-muted/60 text-left text-xs uppercase tracking-wider text-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Hotel</th>
                <th className="px-4 py-3 font-medium">Website</th>
                <th className="px-4 py-3 font-medium">Guide</th>
                <th className="px-4 py-3 font-medium">Locale</th>
                <th className="px-4 py-3 font-medium text-right"># DL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {leads.map((lead) => (
                <tr key={lead.id} className="text-fg">
                  <td className="px-4 py-3 align-top text-subtle whitespace-nowrap">
                    <time dateTime={lead.created_at}>
                      {formatWhen(lead.created_at)}
                    </time>
                  </td>
                  <td className="px-4 py-3 align-top">{lead.visitor_name}</td>
                  <td className="px-4 py-3 align-top">
                    <a
                      href={`mailto:${lead.email}`}
                      className="text-fg hover:underline"
                    >
                      {lead.email}
                    </a>
                  </td>
                  <td className="px-4 py-3 align-top">{lead.hotel_name}</td>
                  <td className="px-4 py-3 align-top text-subtle">
                    {lead.website ? (
                      <a
                        href={normalizeHref(lead.website)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-fg"
                      >
                        {lead.website}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-subtle">
                    <code className="text-xs">{lead.guide_slug}</code>
                  </td>
                  <td className="px-4 py-3 align-top text-subtle">
                    {lead.visitor_locale}
                  </td>
                  <td className="px-4 py-3 align-top text-right tabular-nums">
                    {lead.download_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

type LeadRow = {
  id: string
  email: string
  visitor_name: string
  hotel_name: string
  website: string | null
  guide_slug: string
  visitor_locale: string
  download_count: number
  created_at: string
}

async function loadLeads(): Promise<LeadRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('guide_leads')
    .select(
      'id, email, visitor_name, hotel_name, website, guide_slug, visitor_locale, download_count, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    console.error('[admin/leads] load failed', error)
    return []
  }
  return (data ?? []) as LeadRow[]
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function normalizeHref(input: string): string {
  if (/^https?:\/\//i.test(input)) return input
  return `https://${input}`
}
