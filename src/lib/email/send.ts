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

type SignupNotificationArgs = {
  email: string
  fullName: string
  hotelName: string
  phone: string | null
  message: string | null
}

/**
 * Notify the platform admin (BRAND.supportEmail) when a new public signup
 * request lands so they can review it on /admin. Best-effort: no-op + warn
 * if RESEND_API_KEY isn't set so the signup form still works in dev.
 */
export async function sendSignupNotification(
  args: SignupNotificationArgs,
): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set; skipping signup notification')
    return false
  }

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.myhotelops.com'
  ).replace(/\/+$/, '')
  const adminUrl = `${siteUrl}/admin`

  const subject = `[${BRAND.name}] New signup: ${args.hotelName}`
  const lines = [
    `New signup request on ${BRAND.name}:`,
    '',
    `Hotel: ${args.hotelName}`,
    `Name:  ${args.fullName}`,
    `Email: ${args.email}`,
    args.phone ? `Phone: ${args.phone}` : null,
    args.message ? `\nMessage:\n${args.message}` : null,
    '',
    `Review at: ${adminUrl}`,
  ].filter((l): l is string => l !== null)
  const text = lines.join('\n')

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#1c1917;font-size:14px;line-height:1.6">
      <p>New signup request on <strong>${escapeHtml(BRAND.name)}</strong>:</p>
      <table style="border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#57534e">Hotel</td><td style="padding:4px 0"><strong>${escapeHtml(args.hotelName)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#57534e">Name</td><td style="padding:4px 0">${escapeHtml(args.fullName)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#57534e">Email</td><td style="padding:4px 0"><a href="mailto:${escapeHtml(args.email)}">${escapeHtml(args.email)}</a></td></tr>
        ${args.phone ? `<tr><td style="padding:4px 12px 4px 0;color:#57534e">Phone</td><td style="padding:4px 0">${escapeHtml(args.phone)}</td></tr>` : ''}
      </table>
      ${args.message ? `<p style="color:#57534e;white-space:pre-wrap;border-left:3px solid #e7e5e4;padding:4px 12px;margin:12px 0">${escapeHtml(args.message)}</p>` : ''}
      <p>
        <a href="${adminUrl}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500">Review on /admin</a>
      </p>
    </div>
  `.trim()

  try {
    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: BRAND.supportEmail,
      subject,
      text,
      html,
      replyTo: args.email,
    })
    if (error) {
      console.error('[email] resend error (signup notification)', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[email] resend threw (signup notification)', err)
    return false
  }
}

type SignupVerificationArgs = {
  to: string
  recipientName: string
  hotelName: string
  verifyUrl: string
}

/**
 * Send the email-verification link a /signup submitter clicks to confirm
 * ownership of the address. We don't show the row on /admin until they
 * verify — closes the "attacker submits a victim's email and the admin
 * sees a real-looking request" gap.
 *
 * Returns whether the email was actually dispatched. Caller decides
 * how to react if RESEND_API_KEY isn't set (in dev / before email is
 * wired up, the signup still completes and the row is auto-verified).
 */
export async function sendSignupVerificationEmail(
  args: SignupVerificationArgs,
): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn(
      '[email] RESEND_API_KEY not set; skipping signup verification email',
    )
    return false
  }

  const subject = `Confirm your email to finish signing up for ${BRAND.name}`
  const greeting = `Hi ${args.recipientName},`
  const text = [
    greeting,
    '',
    `Thanks for signing up ${args.hotelName} for ${BRAND.name}.`,
    `Click the link below to confirm this email address so our team can review your request:`,
    '',
    args.verifyUrl,
    '',
    'The link expires in 24 hours. If you didn’t request this, you can ignore the email.',
    '',
    `— ${BRAND.name}`,
  ].join('\n')

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#1c1917;font-size:14px;line-height:1.6">
      <p>${escapeHtml(greeting)}</p>
      <p>Thanks for signing up <strong>${escapeHtml(args.hotelName)}</strong> for ${escapeHtml(BRAND.name)}. Confirm this email address so our team can review your request:</p>
      <p>
        <a href="${args.verifyUrl}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500">Confirm email</a>
      </p>
      <p style="color:#57534e;font-size:12px">The link expires in 24 hours. If you didn’t request this, you can ignore the email.</p>
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
      console.error('[email] resend error (signup verification)', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[email] resend threw (signup verification)', err)
    return false
  }
}
