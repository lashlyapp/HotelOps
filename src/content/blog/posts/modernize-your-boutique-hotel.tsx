import Link from 'next/link'
import { GuideDownloadForm } from '@/components/marketing/guide-download-form'
import { BRAND } from '@/lib/brand'
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

const ITEMS: { n: string; label: string; tease: string }[] = [
  {
    n: '01',
    label: 'Move maintenance off paper and onto a photo-first ticket.',
    tease:
      'Replace the paper logbook with a photo-first ticket system. GMs typically claw back 4–6 hours a week and the maintenance cycle drops from days to hours.',
  },
  {
    n: '02',
    label: 'Replace the laminated in-room card with a QR arrival page.',
    tease:
      'A branded arrival page guests scan with their phone — current Wi-Fi, dining, menus, neighborhood guide. No app install, no account, no friction.',
  },
  {
    n: '03',
    label: 'Pull Wi-Fi, vendor logins, and equipment records into one source of truth.',
    tease:
      'One searchable, role-gated IT hub for credentials, warranties, floor plans, and brand assets. Closes off the “binder behind the front desk” risk.',
  },
  {
    n: '04',
    label: 'Run every screen at the property from a browser, not a USB stick.',
    tease:
      'Any browser-capable TV becomes a managed screen. Replace per-screen SaaS bills with one flat per-property line.',
  },
  {
    n: '05',
    label: 'Build a vendor directory with last-called dates.',
    tease:
      'Plumbers, electricians, suppliers — names, contracts, last-called dates. The hidden value is in the dates; they surface preventive opportunities before emergencies.',
  },
  {
    n: '06',
    label: 'Take event proposals off Word and onto a tracked pipeline.',
    tease:
      'Inquiry → proposal → invoice in one place. The boutiques that move on this recover 20–40% of inquiries they used to lose to slow-response competitors.',
  },
  {
    n: '07',
    label: 'Set up a one-click emergency broadcast for every screen.',
    tease:
      'Pre-built templates for fire, weather, evacuation. The screens are already there; the broadcast capability is a checkbox.',
  },
  {
    n: '08',
    label: 'Audit your monthly software stack and consolidate.',
    tease:
      'Most boutiques run 8–14 subscriptions; 20–40% of the spend is on tools that are no longer used. Consolidation is also a staff-attention dividend.',
  },
  {
    n: '09',
    label: 'Stop sharing logins. Stand up role-based access.',
    tease:
      'The sticky-note password is the single largest operational liability at a boutique. Per-user logins with role-based access fix it in an afternoon.',
  },
  {
    n: '10',
    label: 'Schedule a monthly “tech walk” of every guest-facing surface.',
    tease:
      'Forty-five minutes a month with your phone. Scan every QR. Watch every screen. Note what is broken in the same ticket system you set up in step one.',
  },
]

const FAQ: { q: string; a: string }[] = [
  {
    q: 'How much does it cost to modernize a boutique hotel’s back office?',
    a: 'Most of the ten moves cost nothing to begin and can be started in a single week of focused effort. The full unified back-office stack at a boutique scale (everything in this guide, in one tool) lands at $100–$200 per property per month — substantially less than buying the equivalent surface from four or five standalone vendors. A 40-room boutique buying maintenance ($130), signage ($50–$180), and guest concierge ($84–$168) à la carte already exceeds that envelope and still has no event management or document storage.',
  },
  {
    q: 'How long does it take to modernize a 40-room boutique hotel?',
    a: 'The first three moves in this guide — maintenance ticketing, the QR arrival page, and the unified IT hub — can be in place inside the first month. The remaining seven items are each roughly a weekend of focused work. Most boutique GMs report meaningful time savings (4–6 hours a week) within the first 30 days of moving maintenance off paper.',
  },
  {
    q: 'Do I need to replace my PMS (Mews, Cloudbeds, Opera, Little Hotelier)?',
    a: 'No. The modernization moves in this guide all sit alongside whatever PMS you already use. Your reservation system continues to own bookings, the folio, and the night audit; the operational layer handles everything the PMS does not — maintenance, events, vendors, signage, guest arrival, document storage. Picking your PMS is a separate decision; modernizing the back office should not force a change there.',
  },
  {
    q: 'What is the single highest-impact change for a boutique hotel?',
    a: 'Moving maintenance ticketing off paper and onto a photo-first system. It returns the largest number of GM hours per week (typically 4–6), it shows up most directly in guest reviews (issues close in hours rather than days), and it surfaces patterns owners cannot see when tickets live in WhatsApp threads.',
  },
  {
    q: 'How do guests notice that a boutique hotel has modernized?',
    a: 'Indirectly, and through a few small surfaces that compound. The Wi-Fi password is on a QR card, not a sun-faded laminated sheet. Issues reported at the front desk get resolved before the guest gets back from dinner. The lobby screens look like the year is 2026. The arrival page opens to the hotel’s actual brand. None of these are conscious; guests notice the absence of friction and they encode the experience into reviews.',
  },
  {
    q: 'Can a 20-room boutique afford modern operational software?',
    a: 'Yes. The historical answer was no, because hospitality software was priced per seat, per room, or per screen — pricing models that punish small properties. The current answer is yes because per-property pricing has emerged: one flat number per location, regardless of seat count, screen count, or room count. At that pricing model, a 20-room property and a 60-room property pay the same, and both fit the budget.',
  },
  {
    q: 'How is this different from what big hotel chains do?',
    a: 'It is not, structurally. The same operational capabilities — cloud-native maintenance ticketing, role-based access, audit logs, multi-location management — have been standard at chain hotels for a decade. The difference was access: legacy vendors priced the tooling for properties with 200+ rooms and an IT department. That gap is closing in 2026; the same capability surface is now available at boutique scale.',
  },
]

export default function Post() {
  const slug = '10-ways-to-modernize-your-boutique-hotel'
  const pageUrl = `https://www.${BRAND.domain}/blog/${slug}`

  // HowTo schema — Google can render this as a step-by-step rich
  // result for the "10 ways..." query. Each step lists name +
  // description so the snippet is informative even without a click.
  const howToJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: '10 ways to modernize your boutique hotel',
    description:
      'A field guide for boutique hotel operators: ten high-leverage moves to close the operational gap against larger hotel chains.',
    totalTime: 'P7D',
    estimatedCost: { '@type': 'MonetaryAmount', currency: 'USD', value: '0' },
    supply: [
      { '@type': 'HowToSupply', name: 'Front desk phone or tablet' },
      { '@type': 'HowToSupply', name: 'Existing property TVs (browser-capable)' },
      { '@type': 'HowToSupply', name: 'A printable QR card per room' },
    ],
    tool: [
      { '@type': 'HowToTool', name: 'Hotel back-office operations software' },
    ],
    step: ITEMS.map((item, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: item.label.replace(/\.$/, ''),
      itemListElement: {
        '@type': 'HowToDirection',
        text: item.tease,
      },
      url: `${pageUrl}#step-${i + 1}`,
    })),
  }

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(howToJsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c'),
        }}
      />

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
        who quietly choose the next-door property instead. This guide
        is the playbook to close it.
      </p>
      <p>
        Closing the gap in 2026 does not require an enterprise budget.
        It requires a list. Ten moves, most of which can be started
        this week, most of which cost nothing to begin, and all of
        which have been adopted at scale by chain hotels for years.
        The properties that work through this list run circles around
        the ones that do not — and they read as “tight” to guests in
        a way that translates directly into review scores, direct
        bookings, and rate flexibility.
      </p>

      <h2 id="contents">What is in this guide</h2>
      <p>
        The first three moves are shown in full below, so you can
        start them today without filling out anything. The remaining
        seven are summarized; the full versions — with concrete
        numbers, examples, and how the MyHotelOps stack handles each
        one — live in the free 8-page PDF at the bottom of this
        page.
      </p>

      <ol className="not-prose mt-6 grid gap-2 rounded-2xl border border-border-subtle bg-surface-muted/40 p-6 sm:grid-cols-2">
        {ITEMS.map((item, i) => (
          <li
            key={item.n}
            className="flex gap-3 text-sm text-fg leading-snug"
          >
            <span className="font-mono text-xs text-subtle pt-0.5">
              {item.n}
            </span>
            <a
              href={`#step-${i + 1}`}
              className="hover:underline"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>

      <h2 id="step-1">1. Move maintenance off paper and onto a photo-first ticket.</h2>
      <p>
        If you do nothing else on this list, do this one. The single
        highest-leverage modernization move at a boutique hotel is
        replacing the paper logbook — or the WhatsApp thread, or the
        notepad behind the front desk — with a system where every
        ticket starts with a photo and a room number and ends with
        an after-photo.
      </p>
      <p>
        The reason it works is not the software. It is what the
        software enforces. A photo collapses the gap between “the
        bathtub is chipped” and “fix this specific bathtub by 3 PM.”
        The room number tag collapses the gap between “there is a
        leak somewhere on the third floor” and “312 needs the
        engineer now.” The after-photo collapses the gap between
        “marked complete” and “actually complete” — the gap that
        historically eats your weekends.
      </p>
      <p>
        <strong>What it costs you not to do:</strong> at most boutique
        properties the median maintenance cycle from guest report to
        resolved fix is 2–3 days when run on paper, versus under 4
        hours when run on a photo-first ticket system. That delta
        translates into roughly one negative review per month at a
        40-room property, and somewhere between 4 and 6 hours a week
        of GM time spent re-asking, re-tagging, and re-chasing
        tickets that have been sitting in someone’s phone.
      </p>
      <p>
        <strong>What good looks like:</strong> front desk takes the
        photo. Engineering sees it on a phone within minutes. The
        ticket carries the room, the priority, the reporter, and a
        clock. The fix happens. The after-photo gets uploaded. The
        ticket auto-closes with a timestamped audit log the owner
        can scan at the end of the month.
      </p>

      <h2 id="step-2">2. Replace the laminated in-room card with a QR arrival page.</h2>
      <p>
        Walk into any boutique property and you will find some
        version of the same artifact on the desk: a laminated card
        with the Wi-Fi password, the breakfast hours, the front
        desk extension, and a sun-faded photo of a sandwich. It was
        printed in 2019. The Wi-Fi password is wrong. Nobody on
        staff knows who is authorized to update it.
      </p>
      <p>
        Replacing it costs a few cents per room. Print a QR code
        per room that opens a branded arrival page on the guest’s
        phone: the current Wi-Fi password, current restaurant
        hours, room service menu with photos, spa hours, gym info,
        a neighborhood guide. The guest scans it with the camera
        app they already have open. No app install, no account, no
        login.
      </p>
      <p>
        <strong>What it costs you not to do:</strong> in 2026, a
        guest who has to call the front desk for the Wi-Fi password
        registers your property as “behind.” Chain hotels have
        moved this surface online entirely. An Airbnb stay has a
        digital welcome page. A boutique without one reads as a
        property that is not quite paying attention — and that
        impression encodes directly into the next review.
      </p>
      <p>
        <strong>What good looks like:</strong> the QR card is small,
        designed to match your brand, and printed alongside the
        room key cards. Scanning takes the guest to a fast-loading
        page that opens to your hotel’s palette. The Wi-Fi password
        is one tap to copy. The dining hours reflect what is
        actually open today, not what was printed in March. The GM
        can edit any of the content in five minutes from a phone.
      </p>

      <h2 id="step-3">3. Pull Wi-Fi, vendor logins, and equipment records into one source of truth.</h2>
      <p>
        Find the binder behind the front desk. Find the Drive
        folder no one has updated since the last GM left. Find the
        notes app on the engineering manager’s phone. Find the
        printout pinned to the bulletin board in the breakroom. All
        four of these documents claim to be the same source of
        truth about your operational systems. None of them are.
      </p>
      <p>
        Pick one place. Move the Wi-Fi SSIDs and credentials, the
        vendor portal logins (your booking engine, your channel
        manager, your accounting system, your payment processor),
        the equipment serial numbers and warranty dates, and the
        floor plans into it. Make it searchable. Make it role-gated
        so the front desk does not have ownership-tier access and
        ownership does not have to ask the front desk for the spa
        Wi-Fi password.
      </p>
      <p>
        <strong>What it costs you not to do:</strong> every time
        something breaks at 11 PM and the on-shift manager has to
        text the GM for the warranty contact, you pay the labor cost
        twice and the resolution-time cost on top. The annualized
        cost of scattered operational knowledge is one of the larger
        hidden line items at a boutique, and it accelerates with
        staff turnover — every departing GM takes a slice of it with
        them.
      </p>
      <p>
        <strong>What good looks like:</strong> one searchable
        directory with role-based access. Front desk can see Wi-Fi
        and dining info but not vendor portals. Engineering can see
        equipment, warranties, and vendor contacts but not ownership
        financials. Owners see everything. When a staff member
        leaves, you close one account; you do not change six
        passwords.
      </p>

      <h2 id="next-seven">The next 7 moves (full versions in the PDF)</h2>
      <p>
        These are the operational shifts the rest of the boutique
        segment is sleeping through. Each one is a single weekend of
        focused work, with concrete savings and concrete guest-facing
        wins. The full PDF walks through what each one looks like in
        practice and how the MyHotelOps stack handles it on day one
        if you would rather not build the surface yourself.
      </p>

      <ul className="not-prose mt-4 grid gap-4">
        {ITEMS.slice(3).map((item, i) => (
          <li
            key={item.n}
            id={`step-${i + 4}`}
            className="rounded-xl border border-border-subtle bg-surface p-5"
          >
            <p className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-subtle">
                {item.n}
              </span>
              <span className="text-base font-semibold text-fg">
                {item.label}
              </span>
            </p>
            <p className="mt-2 text-sm text-muted leading-relaxed">
              {item.tease}
            </p>
          </li>
        ))}
      </ul>

      <h2 id="get-the-pdf">Get the full 10-page field guide.</h2>
      <p>
        We wrote this for boutique operators, not casual browsers — and
        we want to know who is reading it so we can answer follow-up
        questions and learn what is missing from the playbook. Enter
        your name, email, and the hotel you run; we will email the PDF
        to you and you can also download it instantly here. We do not
        spam. We do not share email addresses with anyone. If the
        answer to “does MyHotelOps fit your operation” turns out to be
        no, we will tell you directly.
      </p>

      <GuideDownloadForm
        guideSlug="10-ways-modernize-boutique-hotel"
        t={{
          heading: 'Get the full 8-page guide.',
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

      <h2 id="faq">Frequently asked questions about modernizing a boutique hotel</h2>
      {FAQ.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>{f.a}</p>
        </div>
      ))}

      <h2 id="further-reading">Further reading</h2>
      <p>
        For more on the structural reasons the boutique segment has
        been underserved, see our piece on{' '}
        <Link href="/blog/boutique-hotels-underserved-by-software">
          why boutique hotels are the most underserved corner of
          hospitality tech
        </Link>
        . For the budget math behind why per-property pricing matters,
        see{' '}
        <Link href="/blog/boutique-hotel-operations-budget">
          what the boutique hotel operations budget actually looks like
        </Link>
        . And for the cleanest framing of why the PMS is not your
        operations system, read{' '}
        <Link href="/blog/pms-is-not-your-operations-system">
          your PMS is not your operations system — here is what is
        </Link>
        .
      </p>
    </>
  )
}
