import 'server-only'
import { BRAND } from '@/lib/brand'
import { getEmailFrom, getResend } from '@/lib/email/client'
import type { SourceHealthState } from '@/lib/market/health'

export async function sendSourceHealthAlert(args: {
  to: string
  sources: SourceHealthState[]
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false
  if (args.sources.length === 0) return false

  const subject = `[${BRAND.name}] ${args.sources.length} data source${args.sources.length === 1 ? '' : 's'} unhealthy`
  const rowsText = args.sources
    .map(
      (s) =>
        `• ${s.display_name} (${s.source}) — ${s.reason}${s.last_error_message ? `: ${s.last_error_message}` : ''}`,
    )
    .join('\n')

  const text = [
    `${args.sources.length} Revenue Intelligence data source${args.sources.length === 1 ? '' : 's'} need${args.sources.length === 1 ? 's' : ''} attention:`,
    '',
    rowsText,
    '',
    `Inspect: https://www.myhotelops.com/admin/data-sources`,
    '',
    `— ${BRAND.name}`,
  ].join('\n')

  const rowsHtml = args.sources
    .map(
      (s) => `
    <tr>
      <td style="padding:6px 12px 6px 0;font-weight:500">${escapeHtml(s.display_name)}</td>
      <td style="padding:6px 12px 6px 0;color:#a16207">${escapeHtml(s.reason)}</td>
      <td style="padding:6px 0;color:#57534e;font-size:12px">${escapeHtml(s.last_error_message ?? '')}</td>
    </tr>`,
    )
    .join('')

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;color:#1c1917;font-size:14px;line-height:1.6">
      <p><strong>${args.sources.length} data source${args.sources.length === 1 ? '' : 's'} unhealthy</strong></p>
      <table style="border-collapse:collapse;margin:12px 0">${rowsHtml}</table>
      <p><a href="https://www.myhotelops.com/admin/data-sources" style="color:#1c1917">Open admin pipeline →</a></p>
      <p style="color:#a8a29e;font-size:12px;margin-top:24px">
        You receive this because you're a platform admin on ${escapeHtml(BRAND.name)}.
        Re-alert dedupes for 24h while a source stays broken.
      </p>
    </div>
  `

  try {
    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: args.to,
      subject,
      text,
      html,
    })
    if (error) {
      console.error('[source-health-alert] resend error', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[source-health-alert] resend threw', err)
    return false
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
