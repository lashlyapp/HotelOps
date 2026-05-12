import Link from 'next/link'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { BRAND, BRAND_ADDRESS_LINES } from '@/lib/brand'

// Last meaningful revision to the policy. Bump this when you update the
// document so customers see "updated" copy and (optionally) re-prompt.
export const PRIVACY_POLICY_LAST_UPDATED = '2026-05-12'

export const metadata = {
  title: `Privacy Policy — ${BRAND.name}`,
  description: `How ${BRAND.name} collects, uses, and protects your data.`,
}

export default function PrivacyPolicyPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Wordmark size="md" href="/" />
          <Link
            href="/"
            className="focus-ring rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-muted">
            Last updated {PRIVACY_POLICY_LAST_UPDATED}
          </p>

          <Section title="Summary">
            <p>
              {BRAND.name} (&quot;<strong>{BRAND.name}</strong>&quot;, &quot;we&quot;,
              &quot;us&quot;) provides hospitality operations software to hotel
              property owners. This Privacy Policy explains what personal
              information we collect, how we use it, who we share it with, and
              the rights you have over your information.
            </p>
          </Section>

          <Section title="Information we collect">
            <ul className="space-y-2 list-disc pl-5">
              <li>
                <strong>Account information</strong> — name, work email, hotel
                name, optional phone number, and your account password (stored
                hashed by our authentication provider).
              </li>
              <li>
                <strong>Tenant content</strong> — files, photos, videos,
                documents, event records, vendor credentials, and other
                content you upload or create inside {BRAND.name}.
              </li>
              <li>
                <strong>Billing information</strong> — your subscription
                status, invoice history, and payment-method metadata
                (last-4, brand). Full card numbers are stored exclusively
                with Stripe and never reach our servers.
              </li>
              <li>
                <strong>Usage and operational data</strong> — IP address,
                browser/device info, timestamps, and pages visited, used to
                operate and secure the service.
              </li>
              <li>
                <strong>Support communications</strong> — emails or messages
                you send to {BRAND.supportEmail} or that we send you about
                your account.
              </li>
            </ul>
          </Section>

          <Section title="How we use information">
            <ul className="space-y-2 list-disc pl-5">
              <li>Provide, operate, and improve the service.</li>
              <li>Authenticate you and protect against unauthorized access.</li>
              <li>Process payments and manage subscriptions.</li>
              <li>Send transactional emails (password resets, billing notices, account changes).</li>
              <li>Respond to support requests.</li>
              <li>Comply with legal obligations and enforce our agreements.</li>
            </ul>
            <p>
              We do not sell your personal information. We do not use your
              tenant content to train AI models.
            </p>
          </Section>

          <Section title="Sub-processors">
            <p>
              We rely on the following service providers to operate
              {' '}{BRAND.name}. Each is bound by their own privacy and security
              commitments:
            </p>
            <ul className="space-y-2 list-disc pl-5">
              <li>
                <strong>Supabase</strong> — database and authentication
                (US/EU regions).
              </li>
              <li>
                <strong>Cloudflare</strong> — object storage (R2), CDN, and
                edge compute (global).
              </li>
              <li>
                <strong>Stripe</strong> — payment processing and billing
                (PCI-DSS Level 1).
              </li>
              <li>
                <strong>Resend</strong> — transactional email delivery.
              </li>
              <li>
                <strong>Vercel</strong> — application hosting.
              </li>
            </ul>
          </Section>

          <Section title="Data retention">
            <p>
              We retain your account and tenant content while your subscription
              is active. After cancellation, we retain it for up to 30 days
              to support reactivation, then permanently delete it unless we are
              required to keep it longer to comply with law or resolve disputes.
              Backups expire automatically on a rolling 30-day window.
            </p>
          </Section>

          <Section title="Your rights">
            <p>
              You can access and update most account information from your
              {BRAND.name} dashboard. To exercise rights of access, correction,
              deletion, portability, or restriction (including under GDPR, UK
              GDPR, CCPA/CPRA, or LGPD), email{' '}
              <a
                href={`mailto:${BRAND.supportEmail}?subject=Privacy request`}
                className="font-medium text-fg hover:underline"
              >
                {BRAND.supportEmail}
              </a>
              . We respond within 30 days.
            </p>
          </Section>

          <Section title="Security">
            <p>
              We use industry-standard practices to protect your data: TLS in
              transit, encryption at rest, role-based access controls, and
              least-privilege secret management. No system is perfectly secure;
              we encourage you to use a strong, unique password and never share
              your credentials.
            </p>
          </Section>

          <Section title="Children">
            <p>
              {BRAND.name} is a business product not intended for individuals
              under 18. We do not knowingly collect personal information from
              children.
            </p>
          </Section>

          <Section title="International transfers">
            <p>
              {BRAND.name} is operated from the United States. If you access
              the service from outside the United States, you understand that
              your information may be transferred to and processed in the
              United States and other countries where our sub-processors
              operate.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              We may update this Privacy Policy from time to time. Material
              changes will be communicated by email or in-product notice at
              least 7 days before they take effect. Continued use of
              {' '}{BRAND.name} after changes take effect constitutes acceptance.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions or requests under this Privacy Policy can be sent to{' '}
              <a
                href={`mailto:${BRAND.supportEmail}`}
                className="font-medium text-fg hover:underline"
              >
                {BRAND.supportEmail}
              </a>
              {' '}or by post:
            </p>
            <address className="not-italic text-muted">
              {BRAND_ADDRESS_LINES.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </address>
          </Section>
        </article>
      </main>

      <Footer variant="public" />
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-10 space-y-3 text-sm text-fg leading-relaxed">
      <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
      <div className="space-y-3 text-muted">{children}</div>
    </section>
  )
}
