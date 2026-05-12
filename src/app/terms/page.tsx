import Link from 'next/link'
import { Wordmark } from '@/components/brand/wordmark'
import { Footer } from '@/components/layout/footer'
import { BRAND, BRAND_ADDRESS_LINES } from '@/lib/brand'

// Bump on each meaningful revision so customers re-accept (and the consent
// audit row stamps the version they agreed to).
export const TERMS_OF_SERVICE_LAST_UPDATED = '2026-05-12'

export const metadata = {
  title: `Terms of Service — ${BRAND.name}`,
  description: `The agreement between ${BRAND.name} and its customers.`,
}

export default function TermsOfServicePage() {
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
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-muted">
            Last updated {TERMS_OF_SERVICE_LAST_UPDATED}
          </p>

          <Section title="1. Acceptance">
            <p>
              These Terms of Service (&quot;<strong>Terms</strong>&quot;) form a
              binding agreement between you (the &quot;Customer&quot;) and{' '}
              {BRAND.legalName} (&quot;<strong>{BRAND.name}</strong>&quot;,
              &quot;we&quot;, &quot;us&quot;) regarding your use of the
              {' '}{BRAND.name} service. By creating an account or using the
              service, you agree to these Terms and the{' '}
              <Link href="/privacy" className="font-medium text-fg hover:underline">
                Privacy Policy
              </Link>
              . If you are agreeing on behalf of a company, you represent that
              you have authority to bind that company.
            </p>
          </Section>

          <Section title="2. The Service">
            <p>
              {BRAND.name} provides hospitality operations software for hotel
              property owners and their teams, including (without limitation)
              media cataloging, event management, IT documentation, billing,
              and team management features. We may add, change, or remove
              features over time.
            </p>
          </Section>

          <Section title="3. Accounts">
            <ul className="space-y-2 list-disc pl-5">
              <li>
                You are responsible for all activity under your account and for
                keeping your password confidential.
              </li>
              <li>
                You must use accurate, current information when creating an
                account and keep it up to date.
              </li>
              <li>
                You must promptly notify {BRAND.supportEmail} of any
                unauthorized access or use.
              </li>
            </ul>
          </Section>

          <Section title="4. Subscription, fees, and billing">
            <p>
              {BRAND.name} is sold on a monthly per-property subscription
              billed in advance through Stripe. Pricing for new customers is
              the rate displayed at signup or in your written agreement. Setup
              fees, if applicable, are billed on the first invoice.
            </p>
            <p>
              We may change subscription prices on at least 30 days&apos;
              notice; changes apply to the next billing cycle. Past-due
              accounts may be suspended or restricted; we will provide notice
              and a reasonable cure period before suspension.
            </p>
            <p>
              Except as required by law, fees are non-refundable. You can
              cancel at any time from your billing page; cancellation takes
              effect at the end of the current billing period.
            </p>
          </Section>

          <Section title="5. Customer content and license">
            <p>
              You retain all rights to the content you upload to {BRAND.name}
              (&quot;<strong>Customer Content</strong>&quot;). You grant
              {' '}{BRAND.name} a worldwide, non-exclusive, royalty-free license
              to host, copy, transmit, and display Customer Content solely to
              provide the service. We do not use Customer Content to train AI
              models.
            </p>
            <p>
              You are responsible for the legality of your Customer Content
              and for having the rights to upload it.
            </p>
          </Section>

          <Section title="6. Acceptable use">
            <p>You agree not to:</p>
            <ul className="space-y-2 list-disc pl-5">
              <li>Violate any law or third-party rights.</li>
              <li>
                Upload malicious code, scrape the service, or attempt to
                circumvent security controls or rate limits.
              </li>
              <li>
                Use the service to send spam, phishing, or other unsolicited
                communications.
              </li>
              <li>
                Reverse engineer the service except where allowed by
                applicable law.
              </li>
              <li>
                Resell, sublicense, or use the service to operate a competing
                product.
              </li>
            </ul>
          </Section>

          <Section title="7. Suspension and termination">
            <p>
              We may suspend or terminate your access if you breach these
              Terms or if your account is past due. You may terminate at any
              time by cancelling your subscription. On termination, your
              right to use the service ends; Customer Content may be retained
              for up to 30 days as described in the Privacy Policy.
            </p>
          </Section>

          <Section title="8. Disclaimers">
            <p className="uppercase tracking-wide">
              The service is provided &quot;as is&quot; and &quot;as
              available&quot; without warranties of any kind, express or
              implied, including warranties of merchantability, fitness for
              a particular purpose, and non-infringement, to the maximum
              extent permitted by law.
            </p>
          </Section>

          <Section title="9. Limitation of liability">
            <p className="uppercase tracking-wide">
              To the maximum extent permitted by law, neither party will be
              liable for indirect, incidental, special, consequential, or
              exemplary damages, or for lost profits or revenue. Our
              aggregate liability for any claim arising out of or relating
              to these Terms or the service will not exceed the amount you
              paid us for the service in the 12 months preceding the event
              giving rise to the claim.
            </p>
          </Section>

          <Section title="10. Indemnification">
            <p>
              You will defend, indemnify, and hold harmless {BRAND.name} from
              and against any third-party claims arising out of your use of
              the service, your Customer Content, or your breach of these
              Terms.
            </p>
          </Section>

          <Section title="11. Changes to these Terms">
            <p>
              We may update these Terms from time to time. Material changes
              will be communicated by email or in-product notice at least 7
              days before they take effect. Continued use of {BRAND.name}
              after the effective date constitutes acceptance.
            </p>
          </Section>

          <Section title="12. Governing law">
            <p>
              These Terms are governed by the laws of the State of California,
              United States, without regard to its conflict-of-laws rules.
              The exclusive forum for any dispute is the state or federal
              courts located in Sacramento County, California, and the
              parties consent to the jurisdiction and venue of those courts.
            </p>
          </Section>

          <Section title="13. Contact">
            <p>Notices to {BRAND.name} should be sent to:</p>
            <address className="not-italic text-muted">
              {BRAND_ADDRESS_LINES.map((line) => (
                <div key={line}>{line}</div>
              ))}
              <div className="mt-2">
                <a
                  href={`mailto:${BRAND.supportEmail}`}
                  className="font-medium text-fg hover:underline"
                >
                  {BRAND.supportEmail}
                </a>
              </div>
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
