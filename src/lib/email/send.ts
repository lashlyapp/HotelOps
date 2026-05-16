import 'server-only'
import { BRAND } from '@/lib/brand'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { interpolate } from '@/lib/i18n/interpolate'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locales'
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
 * signup (see {@link sendTrialWelcomeEmail} for that). English-only
 * for now — the authenticated-app surface isn't localized yet.
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
    <p style="color:#a8a29e;font-size:12px;margin-top:32px">— ${escapeHtml(BRAND.name)}</p>
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
  /** Locale captured at signup. Falls back to English when omitted
   *  so older callers (or tests) keep working. */
  locale?: Locale
}

/**
 * Send the 6-digit code the /signup form asks the user to enter to
 * prove they own the email address. The code itself is in giant
 * type in both the text and HTML so it's trivially copy/pasteable
 * on mobile clients. Subject + body + CTA all render in the
 * visitor's locale.
 */
export async function sendSignupOtpEmail(args: SignupOtpArgs): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set; skipping signup OTP email')
    return false
  }

  const t = getDictionary(args.locale ?? DEFAULT_LOCALE).email
  const vars = {
    code: args.code,
    name: args.recipientName,
    hotel: args.hotelName,
    minutes: args.ttlMinutes,
  }

  const subject = interpolate(t.otp.subject, { code: args.code })
  const greeting = interpolate(t.otp.greeting, vars)
  const intro = t.otp.intro
  const instructions = interpolate(t.otp.instructions, vars)
  const ttl = interpolate(t.otp.ttl, vars)
  const signoff = t.signoff

  const text = [
    greeting,
    '',
    intro,
    '',
    `    ${args.code}`,
    '',
    instructions,
    ttl,
    '',
    signoff,
  ].join('\n')

  const html = wrapEmailHtml(`
    <p>${escapeHtml(greeting)}</p>
    <p>${escapeHtml(intro)}</p>
    <p style="text-align:center;margin:24px 0">
      <span style="display:inline-block;font-family:'SF Mono','Menlo','Consolas',monospace;font-size:32px;font-weight:600;letter-spacing:8px;background:#f5f5f4;color:#1c1917;padding:14px 24px;border-radius:8px;border:1px solid #e7e5e4">${escapeHtml(args.code)}</span>
    </p>
    <p>${escapeHtml(instructions)}</p>
    <p style="color:#57534e;font-size:12px">${escapeHtml(ttl)}</p>
    <p style="color:#a8a29e;font-size:12px;margin-top:32px">${escapeHtml(signoff)}</p>
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
  locale?: Locale
}

/**
 * Sent the instant signup completes. Tone is "you're in, here's what
 * to do first" — explicit countdown, explicit storage cap, and a CTA
 * back to the dashboard so the email doubles as a recovery link for
 * the rare user who closes the tab. All copy in the visitor's
 * locale.
 */
export async function sendTrialWelcomeEmail(args: TrialWelcomeArgs): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn(
      '[email] RESEND_API_KEY not set; skipping trial-welcome email to ' + args.to,
    )
    return false
  }

  const t = getDictionary(args.locale ?? DEFAULT_LOCALE).email
  const siteUrl = getSiteUrl()
  const dashboardUrl = `${siteUrl}/dashboard`
  const billingUrl = `${siteUrl}/billing`
  const vars = {
    name: args.recipientName,
    hotel: args.hotelName,
    days: args.trialDays,
    gb: args.storageGb,
  }

  const subject = interpolate(t.welcome.subject, vars)
  const greeting = interpolate(t.welcome.greeting, vars)
  const intro = interpolate(t.welcome.intro, vars)
  const ctaOpen = t.welcome.ctaOpen
  const tryHeading = t.welcome.tryFirstHeading
  const tip1 = t.welcome.tryFirstTeam
  const tip2 = t.welcome.tryFirstMedia
  const tip3 = t.welcome.tryFirstWO
  const convertPrefix = t.welcome.convertPrefix
  const convertLink = t.welcome.convertLink
  const convertSuffix = t.welcome.convertSuffix
  const signoff = t.signoff

  const text = [
    greeting,
    '',
    intro,
    '',
    `${ctaOpen}: ${dashboardUrl}`,
    '',
    `${tryHeading}:`,
    `  • ${tip1}`,
    `  • ${tip2}`,
    `  • ${tip3}`,
    '',
    `${convertPrefix}${convertLink}: ${billingUrl}${convertSuffix}`,
    '',
    signoff,
  ].join('\n')

  const html = wrapEmailHtml(`
    <p>${escapeHtml(greeting)}</p>
    <p>${escapeHtml(intro)}</p>
    <p>${ctaButton(dashboardUrl, ctaOpen)}</p>
    <p style="margin-top:24px"><strong>${escapeHtml(tryHeading)}</strong></p>
    <ul style="color:#1c1917;padding-left:18px;line-height:1.7">
      <li>${escapeHtml(tip1)}</li>
      <li>${escapeHtml(tip2)}</li>
      <li>${escapeHtml(tip3)}</li>
    </ul>
    <p style="color:#57534e">${escapeHtml(convertPrefix)}<a href="${billingUrl}" style="color:#1c1917;text-decoration:underline">${escapeHtml(convertLink)}</a>${escapeHtml(convertSuffix)}</p>
    <p style="color:#a8a29e;font-size:12px;margin-top:32px">${escapeHtml(signoff)}</p>
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
  locale?: Locale
}

/** Sent at T-3 days. Soft nudge; no scare tactics. */
export async function sendTrialReminderEmail(args: TrialReminderArgs): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  const t = getDictionary(args.locale ?? DEFAULT_LOCALE).email
  const siteUrl = getSiteUrl()
  const billingUrl = `${siteUrl}/billing`
  const isSingular = args.daysLeft === 1
  const vars = {
    name: args.recipientName,
    hotel: args.hotelName,
    days: args.daysLeft,
  }

  const subject = interpolate(
    isSingular ? t.reminder.subjectOne : t.reminder.subjectMany,
    vars,
  )
  const greeting = interpolate(t.reminder.greeting, vars)
  const body = interpolate(
    isSingular ? t.reminder.bodyOne : t.reminder.bodyMany,
    vars,
  )
  const cta = t.reminder.cta
  const signoff = t.signoff

  const text = [
    greeting,
    '',
    body,
    '',
    `${cta}: ${billingUrl}`,
    '',
    signoff,
  ].join('\n')

  const html = wrapEmailHtml(`
    <p>${escapeHtml(greeting)}</p>
    <p>${escapeHtml(body)}</p>
    <p>${ctaButton(billingUrl, cta)}</p>
    <p style="color:#a8a29e;font-size:12px;margin-top:32px">${escapeHtml(signoff)}</p>
  `)
  return sendOrLog(resend, { to: args.to, subject, text, html }, 'trial reminder')
}

type TrialExpiredArgs = {
  to: string
  recipientName: string
  hotelName: string
  locale?: Locale
}

/** Sent at T+0 the day the trial ends. App is read-only at this point. */
export async function sendTrialExpiredEmail(args: TrialExpiredArgs): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  const t = getDictionary(args.locale ?? DEFAULT_LOCALE).email
  const siteUrl = getSiteUrl()
  const billingUrl = `${siteUrl}/billing`
  const vars = {
    name: args.recipientName,
    hotel: args.hotelName,
  }

  const subject = t.expired.subject
  const greeting = interpolate(t.expired.greeting, vars)
  const body = interpolate(t.expired.body, vars)
  const cta = t.expired.cta
  const signoff = t.signoff

  const text = [
    greeting,
    '',
    body,
    '',
    `${cta}: ${billingUrl}`,
    '',
    signoff,
  ].join('\n')

  const html = wrapEmailHtml(`
    <p>${escapeHtml(greeting)}</p>
    <p>${escapeHtml(body)}</p>
    <p>${ctaButton(billingUrl, cta)}</p>
    <p style="color:#a8a29e;font-size:12px;margin-top:32px">${escapeHtml(signoff)}</p>
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

// ---------------------------------------------------------------------------
// /demo booking — visitor picks a slot, we email founder + visitor
// ---------------------------------------------------------------------------
type DemoBookingNotificationArgs = {
  /** Operator inbox (typically BRAND.supportEmail). */
  to: string
  /** Optional cc — useful when more than one person fields demos. */
  cc?: string
  visitorName: string
  visitorEmail: string
  hotelName: string
  propertyCount: string | null
  notes: string | null
  slotHumanLabel: string
  /** Visitor's locale at request time, for the operator's reference. */
  visitorLocale: string
}

/**
 * Internal notification: a visitor just booked a slot on /demo.
 * Goes to the founder/operator inbox; reply-to is the visitor so a
 * direct reply lands in their inbox without copy-pasting.
 */
export async function sendDemoBookingNotification(
  args: DemoBookingNotificationArgs,
): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set; skipping demo notification')
    return false
  }

  const subject = `[${BRAND.name}] Demo request: ${args.hotelName} (${args.slotHumanLabel})`
  const lines = [
    `New demo request via /demo.`,
    '',
    `Slot:        ${args.slotHumanLabel}`,
    `Hotel:       ${args.hotelName}`,
    `Properties:  ${args.propertyCount ?? '—'}`,
    `Name:        ${args.visitorName}`,
    `Email:       ${args.visitorEmail}`,
    `Locale:      ${args.visitorLocale}`,
    '',
    args.notes ? `Notes:\n${args.notes}` : 'No notes provided.',
    '',
    `Reply to this email to confirm and send the calendar invite.`,
  ]
  const text = lines.join('\n')

  const html = wrapEmailHtml(`
    <p>New demo request via <strong>/demo</strong>.</p>
    <table style="border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#57534e">Slot</td><td style="padding:4px 0"><strong>${escapeHtml(args.slotHumanLabel)}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#57534e">Hotel</td><td style="padding:4px 0"><strong>${escapeHtml(args.hotelName)}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#57534e">Properties</td><td style="padding:4px 0">${escapeHtml(args.propertyCount ?? '—')}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#57534e">Name</td><td style="padding:4px 0">${escapeHtml(args.visitorName)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#57534e">Email</td><td style="padding:4px 0"><a href="mailto:${escapeHtml(args.visitorEmail)}">${escapeHtml(args.visitorEmail)}</a></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#57534e">Locale</td><td style="padding:4px 0"><code>${escapeHtml(args.visitorLocale)}</code></td></tr>
    </table>
    ${args.notes ? `<p style="color:#57534e;white-space:pre-wrap;border-left:3px solid #e7e5e4;padding:4px 12px;margin:12px 0">${escapeHtml(args.notes)}</p>` : '<p style="color:#a8a29e">No notes provided.</p>'}
    <p>Reply to this email to confirm and send the calendar invite.</p>
  `)

  try {
    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: args.to,
      cc: args.cc,
      subject,
      text,
      html,
      replyTo: args.visitorEmail,
    })
    if (error) {
      console.error('[email] resend error (demo notification)', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[email] resend threw (demo notification)', err)
    return false
  }
}

type DemoBookingConfirmationArgs = {
  to: string
  visitorName: string
  hotelName: string
  slotHumanLabel: string
}

/**
 * Confirmation back to the visitor. Promises a Google Meet invite;
 * the founder follows up by replying to the notification email
 * (which lands in the visitor's inbox via the configured reply-to).
 *
 * Stays English regardless of visitor locale for now — this email
 * is short, intent is clear, and translating + plumbing locale
 * through every email function adds surface for a low-volume
 * touchpoint. Revisit when /demo bookings get heavy international
 * volume.
 */
export async function sendDemoBookingConfirmation(
  args: DemoBookingConfirmationArgs,
): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false
  const subject = `Confirmed: your ${BRAND.name} demo on ${args.slotHumanLabel}`
  const text = [
    `Hi ${args.visitorName},`,
    '',
    `We've received your demo request for ${args.hotelName} at ${args.slotHumanLabel}.`,
    `A Google Meet calendar invite is on its way — usually within an hour during business hours, otherwise next morning PT.`,
    '',
    `If anything changes, just reply to this email.`,
    '',
    `— ${BRAND.name}`,
  ].join('\n')
  const html = wrapEmailHtml(`
    <p>Hi ${escapeHtml(args.visitorName)},</p>
    <p>We've received your demo request for <strong>${escapeHtml(args.hotelName)}</strong> at <strong>${escapeHtml(args.slotHumanLabel)}</strong>.</p>
    <p>A Google Meet calendar invite is on its way — usually within an hour during business hours, otherwise next morning PT.</p>
    <p style="color:#57534e">If anything changes, just reply to this email.</p>
    <p style="color:#a8a29e;font-size:12px;margin-top:32px">— ${escapeHtml(BRAND.name)}</p>
  `)
  return sendOrLog(
    resend,
    { to: args.to, subject, text, html },
    'demo confirmation',
  )
}

// ---------------------------------------------------------------------------
// /demo OTP — confirm the visitor owns the email before we book
// ---------------------------------------------------------------------------
type DemoOtpArgs = {
  to: string
  visitorName: string
  hotelName: string
  slotHumanLabel: string
  code: string
  ttlMinutes: number
}

/**
 * 6-digit code sent right after a /demo form submission. The form
 * is locked in OTP-entry mode until the visitor verifies; only then
 * do we fire the founder notification + visitor confirmation
 * (which themselves run from {@link sendDemoBookingNotification}
 * and {@link sendDemoBookingConfirmation}).
 *
 * English-only — same as the rest of the demo flow. Translating
 * adds surface without payoff while volume is single-digit per
 * day; revisit if /demo becomes a primary acquisition channel.
 */
export async function sendDemoBookingOtpEmail(args: DemoOtpArgs): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set; skipping demo OTP email')
    return false
  }

  const subject = `Your ${BRAND.name} demo verification code: ${args.code}`
  const text = [
    `Hi ${args.visitorName},`,
    '',
    `Your verification code for the ${args.hotelName} demo at ${args.slotHumanLabel} is:`,
    '',
    `    ${args.code}`,
    '',
    `Enter it on /demo to confirm your booking. The code expires in ${args.ttlMinutes} minutes.`,
    `If you didn't request this, you can safely ignore this email.`,
    '',
    `— ${BRAND.name}`,
  ].join('\n')

  const html = wrapEmailHtml(`
    <p>Hi ${escapeHtml(args.visitorName)},</p>
    <p>Your verification code for the <strong>${escapeHtml(args.hotelName)}</strong> demo at <strong>${escapeHtml(args.slotHumanLabel)}</strong> is:</p>
    <p style="text-align:center;margin:24px 0">
      <span style="display:inline-block;font-family:'SF Mono','Menlo','Consolas',monospace;font-size:32px;font-weight:600;letter-spacing:8px;background:#f5f5f4;color:#1c1917;padding:14px 24px;border-radius:8px;border:1px solid #e7e5e4">${escapeHtml(args.code)}</span>
    </p>
    <p>Enter it on /demo to confirm your booking.</p>
    <p style="color:#57534e;font-size:12px">The code expires in ${args.ttlMinutes} minutes. If you didn't request this, you can safely ignore this email.</p>
    <p style="color:#a8a29e;font-size:12px;margin-top:32px">— ${escapeHtml(BRAND.name)}</p>
  `)

  return sendOrLog(resend, { to: args.to, subject, text, html }, 'demo OTP')
}

// ---------------------------------------------------------------------------
// Lead magnet (guide download)
// ---------------------------------------------------------------------------
type GuideLeadEmailArgs = {
  to: string
  recipientName: string
  guideTitle: string
  downloadUrl: string
}

/**
 * Deliver the requested guide to the lead. The PDF lives as a static
 * file under /public/downloads; we just link to it rather than
 * attaching the binary. Inline attachments would inflate every send
 * and trip more spam filters than a link to a same-domain asset
 * does. English-only — guide content itself is English-only at
 * launch.
 */
export async function sendGuideLeadEmail(
  args: GuideLeadEmailArgs,
): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set; skipping guide email')
    return false
  }

  const subject = `Your copy of "${args.guideTitle}" — ${BRAND.name}`
  const text = [
    `Hi ${args.recipientName},`,
    '',
    `Thanks for grabbing the guide. Here is your copy:`,
    '',
    args.downloadUrl,
    '',
    `It is a short read — about 18 minutes — and most of the moves in it can be started this week without spending anything. Save it, share it with the GM at the property down the street, or forward it to the owner if that's a separate person.`,
    '',
    `If you want to see what running the back office on one stack actually looks like, our 7-day free trial gives you the full thing with no credit card required: https://www.${BRAND.domain}/signup`,
    '',
    `— ${BRAND.name}`,
  ].join('\n')

  const html = wrapEmailHtml(`
    <p>Hi ${escapeHtml(args.recipientName)},</p>
    <p>Thanks for grabbing the guide. Here is your copy:</p>
    <p style="margin:20px 0">${ctaButton(args.downloadUrl, 'Download the PDF')}</p>
    <p>It is a short read — about 18 minutes — and most of the moves in it can be started this week without spending anything. Save it, share it with the GM at the property down the street, or forward it to the owner if that's a separate person.</p>
    <p style="color:#57534e">If you want to see what running the back office on one stack actually looks like, our 7-day free trial gives you the full thing with no credit card required.</p>
    <p style="margin:16px 0"><a href="https://www.${BRAND.domain}/signup" style="color:#1c1917">Start the free trial →</a></p>
    <p style="color:#a8a29e;font-size:12px;margin-top:32px">— ${escapeHtml(BRAND.name)}</p>
  `)

  return sendOrLog(resend, { to: args.to, subject, text, html }, 'guide')
}

type GuideLeadNotificationArgs = {
  to: string
  cc?: string
  visitorName: string
  visitorEmail: string
  hotelName: string
  website: string | null
  guideTitle: string
  guideSlug: string
  visitorLocale: string
}

/**
 * Internal notification: someone just downloaded the gated guide.
 * Reply-to is the visitor so the founder can follow up with a
 * single click. The PDF link is included for the founder's own
 * reference — opening the same artifact the lead just received
 * speeds up that follow-up conversation.
 */
export async function sendGuideLeadNotification(
  args: GuideLeadNotificationArgs,
): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set; skipping guide notification')
    return false
  }

  const subject = `[${BRAND.name}] Guide download: ${args.hotelName}`
  const lines = [
    `New guide download.`,
    '',
    `Guide:    ${args.guideTitle}`,
    `Slug:     ${args.guideSlug}`,
    `Hotel:    ${args.hotelName}`,
    `Website:  ${args.website ?? '—'}`,
    `Name:     ${args.visitorName}`,
    `Email:    ${args.visitorEmail}`,
    `Locale:   ${args.visitorLocale}`,
    '',
    `Reply to this email to follow up — reply-to is set to the visitor.`,
  ]
  const text = lines.join('\n')

  const html = wrapEmailHtml(`
    <p>New guide download.</p>
    <table style="border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#57534e">Guide</td><td style="padding:4px 0"><strong>${escapeHtml(args.guideTitle)}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#57534e">Hotel</td><td style="padding:4px 0"><strong>${escapeHtml(args.hotelName)}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#57534e">Website</td><td style="padding:4px 0">${escapeHtml(args.website ?? '—')}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#57534e">Name</td><td style="padding:4px 0">${escapeHtml(args.visitorName)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#57534e">Email</td><td style="padding:4px 0"><a href="mailto:${escapeHtml(args.visitorEmail)}">${escapeHtml(args.visitorEmail)}</a></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#57534e">Locale</td><td style="padding:4px 0"><code>${escapeHtml(args.visitorLocale)}</code></td></tr>
    </table>
    <p>Reply to this email to follow up — reply-to is set to the visitor.</p>
  `)

  try {
    const { error } = await resend.emails.send({
      from: getEmailFrom(),
      to: args.to,
      cc: args.cc,
      replyTo: args.visitorEmail,
      subject,
      text,
      html,
    })
    if (error) {
      console.error('[email] resend error (guide notification)', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[email] resend threw (guide notification)', err)
    return false
  }
}

// ---------------------------------------------------------------------------
// Blog publishing cron — drip-publish notifications
// ---------------------------------------------------------------------------
type BlogPostPublishedArgs = {
  to: string
  postTitle: string
  postSlug: string
  postUrl: string
}

/**
 * Internal notification sent by the daily blog-publishing cron when
 * a scheduled post crosses its publishedAt date. One email per
 * newly-live post per day. Founder-only.
 */
export async function sendBlogPostPublishedNotification(
  args: BlogPostPublishedArgs,
): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn(
      '[email] RESEND_API_KEY not set; skipping blog publish notification',
    )
    return false
  }

  const subject = `[${BRAND.name}] Blog post went live: ${args.postTitle}`
  const text = [
    `A scheduled blog post just went live.`,
    '',
    `Title: ${args.postTitle}`,
    `URL:   ${args.postUrl}`,
    `Slug:  ${args.postSlug}`,
    '',
    `Search engines will pick it up on the next sitemap revalidation (within an hour). Time to share it.`,
  ].join('\n')

  const html = wrapEmailHtml(`
    <p>A scheduled blog post just went live.</p>
    <p style="margin:16px 0"><strong>${escapeHtml(args.postTitle)}</strong></p>
    <p style="margin:16px 0">${ctaButton(args.postUrl, 'Open the post')}</p>
    <p style="color:#57534e;font-size:13px">Search engines will pick it up on the next sitemap revalidation (within an hour). Time to share it.</p>
  `)

  return sendOrLog(
    resend,
    { to: args.to, subject, text, html },
    'blog publish',
  )
}

type BlogQueueEmptyArgs = {
  to: string
  /** ISO date of the most recent published post (so the email can
   *  state how long the queue has been empty). */
  latestPublishedAt: string | null
  /** Suggested next publishedAt — 14 days after the latest, or today
   *  if there is no published post yet. */
  nextSuggestedDate: string
}

/**
 * Internal notification when the drip-publish queue runs dry —
 * i.e. no posts in the registry have a future publishedAt. Nudges
 * the founder to write the next draft before the cadence breaks.
 */
export async function sendBlogQueueEmptyNotification(
  args: BlogQueueEmptyArgs,
): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn(
      '[email] RESEND_API_KEY not set; skipping blog queue notification',
    )
    return false
  }

  const subject = `[${BRAND.name}] Blog queue is empty`
  const latestLine = args.latestPublishedAt
    ? `Most recent post: ${args.latestPublishedAt}.`
    : `No posts have been published yet.`
  const text = [
    `The drip-publish queue has no future-dated posts.`,
    '',
    latestLine,
    `Suggested publishedAt for the next post: ${args.nextSuggestedDate} (14 days after the latest).`,
    '',
    `Add a draft under src/content/blog/posts/ with that publishedAt to keep the cadence.`,
  ].join('\n')

  const html = wrapEmailHtml(`
    <p>The drip-publish queue has no future-dated posts.</p>
    <p style="color:#57534e">${escapeHtml(latestLine)}</p>
    <p>Suggested publishedAt for the next post: <strong>${escapeHtml(args.nextSuggestedDate)}</strong> (14 days after the latest).</p>
    <p style="color:#57534e;font-size:13px">Add a draft under <code>src/content/blog/posts/</code> with that <code>publishedAt</code> to keep the cadence.</p>
  `)

  return sendOrLog(
    resend,
    { to: args.to, subject, text, html },
    'blog queue empty',
  )
}
