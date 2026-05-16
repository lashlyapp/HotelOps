import { GuideDownloadForm } from '@/components/marketing/guide-download-form'
import type { BlogPostModule } from '../types'

export const meta: BlogPostModule['meta'] = {
  slug: '10-ways-to-modernize-your-boutique-hotel',
  title: '10 ways to modernize your boutique hotel.',
  description:
    'Closing the gaps against the bigger hotel franchises. A field guide for boutique operators — ten high-leverage moves the chains have used for years, now finally available at boutique scale.',
  publishedAt: '2026-05-15',
  readingMinutes: 25,
  topic: 'Field guide',
  heroImage: '/AdobeStock_1896833868.jpeg',
  heroAlt: 'Modern boutique hotel lobby — quiet and well-run',
}

const ITEMS: { n: string; label: string }[] = [
  { n: '01', label: 'Move maintenance off paper and onto a photo-first ticket.' },
  { n: '02', label: 'Replace the laminated in-room card with a QR arrival page.' },
  { n: '03', label: 'Pull Wi-Fi, vendor logins, and equipment records into one source of truth.' },
  { n: '04', label: 'Run every screen at the property from a browser, not a USB stick.' },
  { n: '05', label: 'Build a vendor directory with last-called dates.' },
  { n: '06', label: 'Take event proposals off Word and onto a tracked pipeline.' },
  { n: '07', label: 'Set up a one-click emergency broadcast for every screen.' },
  { n: '08', label: 'Audit your monthly software stack and consolidate.' },
  { n: '09', label: 'Stop sharing logins. Stand up role-based access.' },
  { n: '10', label: 'Schedule a monthly “tech walk” of every guest-facing surface.' },
]

export default function Post() {
  return (
    <>
      <p>
        The gap between a 40-room boutique and a Marriott is not the
        rooms. It is the back office. Big chains have armies of
        engineers, an IT department, a corporate help desk, an annual
        training budget, and a CapEx line for technology. Boutique
        operators have a GM, a spreadsheet, and a phone full of
        contacts they hope they never lose.
      </p>
      <p>
        That asymmetry costs the boutique segment real money every
        month — in hours lost, in revenue left on the table, in guests
        who quietly choose the next-door property instead.
      </p>
      <p>
        The good news: closing that gap in 2026 does not require an
        enterprise budget. It requires a list. Ten moves, most of
        which can be started this week, most of which cost nothing to
        begin, and all of which have been adopted at scale by the
        chains for years. The properties that work through this list
        run circles around the ones that do not — and they read as
        “tight” to guests in a way that translates directly into
        review scores, direct bookings, and rate flexibility.
      </p>

      <h2>What is in the guide</h2>
      <p>
        We put the full field guide into a free PDF — 8 pages, about
        25 minutes to read — covering all ten moves in detail. For
        each one we walk through what it is, what it costs you not
        to do, what good looks like when it is done well, and how
        the MyHotelOps stack handles the move so you can either
        replicate the pattern on whatever tooling you already use or
        have it solved on day one.
      </p>

      <ul className="not-prose mt-6 grid gap-2 rounded-2xl border border-border-subtle bg-surface-muted/40 p-6 sm:grid-cols-2">
        {ITEMS.map((item) => (
          <li key={item.n} className="flex gap-3 text-sm text-fg leading-snug">
            <span className="font-mono text-xs text-subtle pt-0.5">
              {item.n}
            </span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>

      <h2>Why this guide is gated</h2>
      <p>
        We wrote this for boutique operators, not for casual browsers
        — and we want to know who is reading it so we can answer
        follow-up questions and learn what is missing from the
        playbook. Enter your name, email, and the hotel you run; we
        will email the PDF to you and you can read it on whatever
        device works for you. We do not spam. We do not share email
        addresses with anyone. If the answer to “does MyHotelOps fit
        your operation” turns out to be no, we will tell you
        directly.
      </p>

      <GuideDownloadForm
        guideSlug="10-ways-modernize-boutique-hotel"
        t={{
          heading: 'Get the full 10-page guide.',
          sub: 'A free PDF. We email it to you, and you can also download it instantly after submitting.',
          nameLabel: 'Your name',
          namePlaceholder: 'Jane Doe',
          emailLabel: 'Work email',
          emailPlaceholder: 'jane@yourhotel.com',
          hotelLabel: 'Hotel name',
          hotelPlaceholder: 'The Coastal Inn',
          websiteLabel: 'Hotel website',
          websitePlaceholder: 'yourhotel.com',
          submit: 'Send me the PDF',
          submitting: 'Sending…',
          privacy:
            'We use your email only to deliver the guide and one follow-up. No spam.',
          successHeading: 'The guide is on its way.',
          successBody:
            'Check your inbox in a minute or two for an email with the PDF link. In the meantime you can download it right here.',
          successCta: 'Download the PDF',
          successFallback:
            'If the email does not arrive, check your spam folder or download from the button above.',
        }}
      />
    </>
  )
}
