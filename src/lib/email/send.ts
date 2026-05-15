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
 * Send a welcome email to a newly-added team member. Used by org
 * owners + platform admins inviting users; NOT used for self-serve
 * signup (see {@link sendTrialWelcomeEmail} for that).
 */
export async function sendWelcomeEmail(args: WelcomeArgs): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn(
      '[email] RESEND_API_KEY not set; skipping welcome email to ' + args.to,
    )
    return false
  }

  const siteUrl = getSiteUrl()
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

  const html = wrapEmailHtml(`
    <p>${escapeHtml(greeting)}</p>
    <p>${escapeHtml(inviterPhrase)} <strong>${escapeHtml(args.orgName)}</strong> on ${escapeHtml(BRAND.name)} as <strong>${escapeHtml(args.roleLabel)}</strong>.</p>
    <p>${ctaButton(ctaUrl, ctaLabel)}</p>
    <p style="color:#57534e">Email: <code>${escapeHtml(args.to)}</code></p>
    <p style="color:#57534e">${escapeHtml(passwordLine)}</p>
    ${signoff()}
  `)

  return sendOrLog(resend, { to: args.to, subject, text, html }, 'welcome')
}

// ---------------------------------------------------------------------------
// Self-serve signup: OTP code email
// ---------------------------------------------------------------------------
type SignupOtpArgs = {
  to: string
  recipientName: string
  hotelName: string
  code: string
  ttlMinutes: number
}

/**
 * Send the 6-digit code the /signup form asks the user to enter to
 * prove they own the email address. The code itself is in giant type
 * in both the text and HTML so it's trivially copy/pasteable on
 * mobile clients.
 */
export async function sendSignupOtpEmail(args: SignupOtpArgs): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set; skipping signup OTP email')
    return false
  }

  const subject = `Your ${BRAND.name} verification code: ${args.code}`
  const text = [
    `Hi ${args.recipientName},`,
    '',
    `Your verification code for ${BRAND.name} is:`,
    '',
    `    ${args.code}`,
    '',
    `Enter it on the signup page to finish creating ${args.hotelName}.`,
    `The code expires in ${args.ttlMinutes} minutes. If you didn't request this, you can safely ignore the email.`,
    '',
    `— ${BRAND.name}`,
  ].join('\n')

  const html = wrapEmailHtml(`
    <p>Hi ${escapeHtml(args.recipientName)},</p>
    <p>Your verification code for ${escapeHtml(BRAND.name)} is:</p>
    <p style="text-align:center;margin:24px 0">
      <span style="display:inline-block;font-family:'SF Mono','Menlo','Consolas',monospace;font-size:32px;font-weight:600;letter-spacing:8px;background:#f5f5f4;color:#1c1917;padding:14px 24px;border-radius:8px;border:1px solid #e7e5e4">${escapeHtml(args.code)}</span>
    </p>
    <p>Enter it on the signup page to finish creating <strong>${escapeHtml(args.hotelName)}</strong>.</p>
    <p style="color:#57534e;font-size:12px">The code expires in ${args.ttlMinutes} minutes. If you didn't request this, you can safely ignore this email.</p>
    ${signoff()}
  `)

  return sendOrLog(resend, { to: args.to, subject, text, html }, 'signup OTP')
}

// ---------------------------------------------------------------------------
// Self-serve signup: trial welcome (sent the moment the OTP is verified)
// ---------------------------------------------------------------------------
type TrialWelcomeArgs = {
  to: string
  recipientName: string
  hotelName: string
  trialDays: number
  storageGb: number
}

/**
 * Sent the instant signup completes. Tone is "you're in, here's what
 * to do first" — explicit countdown, explicit storage cap, and a CTA
 * back to the dashboard so the email doubles as a recovery link for
 * the rare user who closes the tab.
 */
export async function sendTrialWelcomeEmail(args: TrialWelcomeArgs): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn(
      '[email] RESEND_API_KEY not set; skipping trial-welcome email to ' + args.to,
    )
    return false
  }

  const siteUrl = getSiteUrl()
  const dashboardUrl = `${siteUrl}/dashboard`
  const billingUrl = `${siteUrl}/billing`

  const subject = `Welcome to ${BRAND.name} — your ${args.trialDays}-day trial is live`
  const text = [
    `Hi ${args.recipientName},`,
    '',
    `${args.hotelName} is set up on ${BRAND.name}. Your free trial gives you full access for ${args.trialDays} days — no credit card needed, ${args.storageGb} GB of media included.`,
    '',
    `Open your dashboard: ${dashboardUrl}`,
    '',
    'What to try first:',
    '  • Add your team from the Team page',
    '  • Upload your first floor plans / photos to Media',
    '  • Create a work order to see the Kanban board in action',
    '',
    `Ready to convert? Add a payment method any time: ${billingUrl}`,
    '',
    `— ${BRAND.name}`,
  ].join('\n')

  const html = wrapEmailHtml(`
    <p>Hi ${escapeHtml(args.recipientName)},</p>
    <p><strong>${escapeHtml(args.hotelName)}</strong> is set up on ${escapeHtml(BRAND.name)}. Your free trial gives you full access for <strong>${args.trialDays} days</strong> — no credit card needed, <strong>${args.storageGb} GB</strong> of media included.</p>
    <p>${ctaButton(dashboardUrl, 'Open your dashboard')}</p>
    <p style="margin-top:24px"><strong>What to try first</strong></p>
    <ul style="color:#1c1917;padding-left:18px;line-height:1.7">
      <li>Add your team from the Team page</li>
      <li>Upload your first floor plans / photos to Media</li>
      <li>Create a work order to see the Kanban board in action</li>
    </ul>
    <p style="color:#57534e">Ready to convert? <a href="${billingUrl}" style="color:#1c1917;text-decoration:underline">Add a payment method</a> any time.</p>
    ${signoff()}
  `)

  return sendOrLog(resend, { to: args.to, subject, text, html }, 'trial welcome')
}

// ---------------------------------------------------------------------------
// Trial expiry nudges (T-3 days and T+0)
// ---------------------------------------------------------------------------
type TrialReminderArgs = {
  to: string
  recipientName: string
  hotelName: string
  daysLeft: number
}

/** Sent at T-3 days. Soft nudge; no scare tactics. */
export async function sendTrialReminderEmail(args: TrialReminderArgs): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  const siteUrl = getSiteUrl()
  const billingUrl = `${siteUrl}/billing`
  const subject = `Your ${BRAND.name} trial ends in ${args.daysLeft} day${args.daysLeft === 1 ? '' : 's'}`
  const text = [
    `Hi ${args.recipientName},`,
    '',
    `Your ${BRAND.name} trial for ${args.hotelName} ends in ${args.daysLeft} day${args.daysLeft === 1 ? '' : 's'}. Add a payment method to keep editing — your data stays where it is regardless.`,
    '',
    `Open Billing: ${billingUrl}`,
    '',
    `— ${BRAND.name}`,
  ].join('\n')
  const html = wrapEmailHtml(`
    <p>Hi ${escapeHtml(args.recipientName)},</p>
    <p>Your ${escapeHtml(BRAND.name)} trial for <strong>${escapeHtml(args.hotelName)}</strong> ends in <strong>${args.daysLeft} day${args.daysLeft === 1 ? '' : 's'}</strong>. Add a payment method to keep editing — your data stays where it is regardless.</p>
    <p>${ctaButton(billingUrl, 'Open Billing')}</p>
    ${signoff()}
  `)
  return sendOrLog(resend, { to: args.to, subject, text, html }, 'trial reminder')
}

type TrialExpiredArgs = {
  to: string
  recipientName: string
  hotelName: string
}

/** Sent at T+0 the day the trial ends. App is read-only at this point. */
export async function sendTrialExpiredEmail(args: TrialExpiredArgs): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  const siteUrl = getSiteUrl()
  const billingUrl = `${siteUrl}/billing`
  const subject = `Your ${BRAND.name} trial has ended — your data is safe`
  const text = [
    `Hi ${args.recipientName},`,
    '',
    `Your ${BRAND.name} trial for ${args.hotelName} ended today. We've moved your account to read-only and we're holding all of your data — add a payment method any time to keep editing.`,
    '',
    `Open Billing: ${billingUrl}`,
    '',
    `— ${BRAND.name}`,
  ].join('\n')
  const html = wrapEmailHtml(`
    <p>Hi ${escapeHtml(args.recipientName)},</p>
    <p>Your ${escapeHtml(BRAND.name)} trial for <strong>${escapeHtml(args.hotelName)}</strong> ended today. We've moved your account to read-only and we're holding all of your data — add a payment method any time to keep editing.</p>
    <p>${ctaButton(billingUrl, 'Open Billing')}</p>
    ${signoff()}
  `)
  return sendOrLog(resend, { to: args.to, subject, text, html }, 'trial expired')
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function wrapEmailHtml(inner: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#1c1917;font-size:14px;line-height:1.6">
      ${inner.trim()}
    </div>
  `.trim()
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500">${escapeHtml(label)}</a>`
}

function signoff(): string {
  return `<p style="color:#a8a29e;font-size:12px;margin-top:32px">— ${escapeHtml(BRAND.name)}</p>`
}

function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.myhotelops.com'
  ).replace(/\/+$/, '')
}

type SendArgs = { to: string; subject: string; text: string; html: string }

async function sendOrLog(
  resend: NonNullable<ReturnType<typeof getResend>>,
  args: SendArgs,
  kind: string,
): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
    })
    if (error) {
      console.error(`[email] resend error (${kind})`, error)
      return false
    }
    return true
  } catch (err) {
    console.error(`[email] resend threw (${kind})`, err)
    return false
  }
}
