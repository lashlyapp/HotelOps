import 'server-only'
import { BRAND } from '@/lib/brand'
import { getEmailFrom, getResend } from './client'

type WelcomeArgs = {
  to: string
  recipientName: string | null
  orgName: string
  roleLabel: string
  inviterName: string | null
  /**
   * If present, the email's CTA is "Set your password and sign in" linking
   * to this one-time URL. Otherwise the CTA is "Sign in" linking to /login,
   * and the recipient relies on the password the inviter set for them.
   */
  setupLink?: string
}

/**
 * Send a welcome email to a newly-added team member.
 *
 * Does NOT include the password — that's shared by the inviter through a
 * secure channel. The email just confirms the account and links to /login.
 *
 * No-op (logs a warning) if RESEND_API_KEY is not configured. Returns whether
 * the email was actually dispatched so the caller can surface the right
 * confirmation copy.
 */
export async function sendWelcomeEmail(args: WelcomeArgs): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn(
      '[email] RESEND_API_KEY not set; skipping welcome email to ' + args.to,
    )
    return false
  }

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.myhotelops.com'
  ).replace(/\/+$/, '')

  const greeting = args.recipientName ? `Hi ${args.recipientName},` : 'Hi there,'
  const inviterPhrase = args.inviterName
    ? `${args.inviterName} added you to`
    : `You've been added to`

  const ctaUrl = args.setupLink ?? `${siteUrl}/login`
  const ctaLabel = args.setupLink ? 'Set your password and sign in' : `Sign in to ${BRAND.name}`
  const passwordLine = args.setupLink
    ? 'Click the button below to set your password and sign in. The link expires in 1 hour — if it does, ask your manager to add you again.'
    : 'Your password was set by your manager — ask them for it. You can change it any time from your account page.'

  const subject = `You've been added to ${args.orgName} on ${BRAND.name}`
  const text = [
    greeting,
    '',
    `${inviterPhrase} ${args.orgName} on ${BRAND.name} as ${args.roleLabel}.`,
    '',
    `${args.setupLink ? 'Set your password and sign in' : 'Sign in'}: ${ctaUrl}`,
    `Email: ${args.to}`,
    '',
    passwordLine,
    '',
    `— ${BRAND.name}`,
  ].join('\n')

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#1c1917;font-size:14px;line-height:1.6">
      <p>${escapeHtml(greeting)}</p>
      <p>${escapeHtml(inviterPhrase)} <strong>${escapeHtml(args.orgName)}</strong> on ${escapeHtml(BRAND.name)} as <strong>${escapeHtml(args.roleLabel)}</strong>.</p>
      <p>
        <a href="${ctaUrl}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500">${escapeHtml(ctaLabel)}</a>
      </p>
      <p style="color:#57534e">Email: <code>${escapeHtml(args.to)}</code></p>
      <p style="color:#57534e">${escapeHtml(passwordLine)}</p>
      <p style="color:#a8a29e;font-size:12px;margin-top:32px">— ${escapeHtml(BRAND.name)}</p>
    </div>
  `.trim()

  try {
    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: args.to,
      subject,
      text,
      html,
    })
    if (error) {
      console.error('[email] resend error', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[email] resend threw', err)
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
