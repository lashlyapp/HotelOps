import Link from 'next/link'
import type { BlogPostModule } from '../types'

export const meta: BlogPostModule['meta'] = {
  slug: 'boutique-hotel-owner-monthly-report',
  title:
    'The boutique hotel owner’s monthly report: what belongs in it, what doesn’t.',
  description:
    'Most boutique hotel monthly reports either drown the owner in numbers they cannot act on or hide the things they actually need to see. Here is the template that works — concise, action-oriented, and built around the questions a real owner has at the start of every month.',
  publishedAt: '2026-08-21',
  readingMinutes: 7,
  topic: 'Multi-property',
  heroImage:
    'https://images.unsplash.com/photo-1543269664-56d93c1b41a6?w=1200&q=80&auto=format&fit=crop',
  heroAlt: 'Hotel owner reviewing the monthly report on a tablet',
}

export default function Post() {
  return (
    <>
      <p>
        Most boutique hotel owners we have talked to either
        receive a monthly report that no one reads or a monthly
        report that does not actually exist. Both failure modes
        are common enough to be the default state of the
        industry. The owner who reads a clean monthly report
        catches problems three weeks earlier than the owner who
        does not, and the discipline of producing a clean monthly
        report is one of the more compounding operational habits
        a boutique can build.
      </p>
      <p>
        Here is what should actually be in it. This is not a
        finance report — your accountant generates that
        separately and it covers a different set of questions.
        This is the operational health snapshot that lets the
        owner answer one question at the start of each month:
        what changed at this property last month, and what does
        it mean for next month?
      </p>

      <h2>The shape: one page, four sections</h2>
      <p>
        A useful monthly report fits on one page. Two pages if
        you absolutely have to, never three. The discipline of
        the one-page constraint forces the report to surface the
        things that actually matter. A 12-page report is a
        12-page report nobody reads.
      </p>
      <p>
        The four sections in order:
      </p>
      <ol>
        <li>The headline — what changed.</li>
        <li>The operational numbers — what they were, what they should have been.</li>
        <li>The events pipeline — what is booked, what is in flight.</li>
        <li>The next 30 days — what needs the owner’s attention.</li>
      </ol>

      <h2>1. The headline</h2>
      <p>
        Two sentences. Maximum three. What was the dominant
        operational story of the month? Is the property running
        smoothly, mostly smoothly with one issue, or actually
        struggling? Owners scan reports; the headline tells
        them whether to read the rest in detail or just skim.
      </p>
      <p>
        Examples of useful headlines:
      </p>
      <ul>
        <li>
          “September was clean. Occupancy and ADR both above
          target; maintenance volume up but cycle times
          steady. One signed event for October ($14k); two
          more in late-stage proposal.”
        </li>
        <li>
          “August was difficult. ADR held but occupancy down
          7 points versus last year, driven by the OTA
          inventory issue we resolved on the 18th. Recovery
          underway but September forecast is soft.”
        </li>
        <li>
          “June was uneventful. Numbers in line with the
          plan. The only operational note is a kitchen
          equipment failure we are still resolving — the
          warranty claim is in flight.”
        </li>
      </ul>
      <p>
        Owners who get a useful headline at the top of every
        report can scan their portfolio in 10 minutes and know
        where to focus. Owners who get a 6-page report with no
        headline scan nothing and end up calling the GM.
      </p>

      <h2>2. The operational numbers</h2>
      <p>
        Five numbers, not fifteen. Each one with a comparison —
        either to the same month last year, to the budget, or to
        the previous month. Pick the comparison that makes the
        number meaningful, not the one that makes the number
        look good.
      </p>
      <p>
        The five that matter at almost every boutique:
      </p>
      <ul>
        <li>
          <strong>Occupancy %.</strong> Vs same month last year.
        </li>
        <li>
          <strong>ADR.</strong> Vs same month last year.
        </li>
        <li>
          <strong>Direct booking % of total.</strong> Vs trailing
          12 months. This is the cheapest signal of brand
          health that exists; if it is drifting down, your
          direct channel is bleeding.
        </li>
        <li>
          <strong>Open maintenance tickets at month-end.</strong>{' '}
          Vs trailing 3 months. Absolute count, not turnaround
          time — the turnaround number lies (it averages over
          the easy ones) and the open count tells you the
          truth.
        </li>
        <li>
          <strong>Review score, last 30 days.</strong> Vs
          trailing 12 months. Recent score, not lifetime.
        </li>
      </ul>
      <p>
        Notice what is not on this list: RevPAR (it is a
        combination of two numbers above; report the
        ingredients), total revenue (it lives in the finance
        report), social media metrics (not operational),
        marketing spend (also finance), staff hours (only
        report if there is a problem). The discipline is to
        report the things that change owner decisions.
      </p>

      <h2>3. The events pipeline</h2>
      <p>
        For properties that take events at all, the pipeline
        snapshot is its own section because events are usually
        the largest variable revenue line and the most
        actionable one for the owner.
      </p>
      <p>
        Four numbers:
      </p>
      <ul>
        <li>
          <strong>Events booked for next 90 days, by month.</strong>{' '}
          Count and aggregate value.
        </li>
        <li>
          <strong>Inquiries in flight</strong> (proposed, negotiating)
          and their aggregate proposal value.
        </li>
        <li>
          <strong>This month’s conversion rate</strong> (booked /
          (booked + lost)). Trend vs trailing 3 months.
        </li>
        <li>
          <strong>Top reason for lost inquiries this month.</strong>{' '}
          Price, date, capacity, or response time — the one
          that dominated.
        </li>
      </ul>
      <p>
        For the framing of how this pipeline view emerges and
        why the four loss reasons matter so much, see{' '}
        <Link href="/blog/boutique-hotel-event-pipeline">
          the event-pipeline post
        </Link>
        .
      </p>

      <h2>4. The next 30 days</h2>
      <p>
        The most-skipped section of the monthly report is also
        the most valuable. Three bullets — items that need the
        owner’s attention or decision in the next month. Each
        one with a recommended action and a deadline.
      </p>
      <p>
        Useful examples:
      </p>
      <ul>
        <li>
          “Espresso machine warranty expires Oct 23. Vendor
          quoted $4,200 for a replacement compressor or $11,000
          for a new unit. GM recommends replacement; need owner
          sign-off by Oct 18.”
        </li>
        <li>
          “Three event inquiries for November weekends; only
          one weekend currently has the ballroom blocked for
          ownership use. Need owner direction on whether to
          release.”
        </li>
        <li>
          “Front desk supervisor is leaving Nov 15. GM has two
          internal candidates and one external; would like
          owner input by Nov 1 to finalize.”
        </li>
      </ul>
      <p>
        This section is what makes the monthly report a
        decision tool rather than a status update. Owners who
        read a report with this section act on three things a
        month they otherwise would not have known about.
        Owners who do not have this section in their report end
        up making the same decisions, but one or two months
        later, when the deadlines have already slipped past.
      </p>

      <h2>What to leave out</h2>
      <p>
        Things that consistently show up in boutique monthly
        reports and should not:
      </p>
      <p>
        <strong>A long preamble.</strong> The owner knows what
        last month was. They were there. Start with the
        headline; do not warm up.
      </p>
      <p>
        <strong>Charts that take more than two seconds to
        read.</strong> If a number needs a chart, write it as
        a number with a trend arrow. Charts that show three
        years of monthly data belong in the annual review,
        not the monthly.
      </p>
      <p>
        <strong>Excuses.</strong> If the numbers were bad,
        say they were bad. Do not bury the bad month in
        context about how it was bad for everyone. Owners
        respect direct reporting; they distrust spin.
      </p>
      <p>
        <strong>Suggestions for new initiatives.</strong> Those
        belong in a separate weekly or biweekly check-in. The
        monthly is for what happened and what needs deciding
        about; new initiatives are their own conversation.
      </p>

      <h2>Who writes it, and when</h2>
      <p>
        The GM writes it. Not the owner asking the GM for the
        numbers; the GM writes the actual report and the owner
        reads it. This is non-negotiable. The discipline of
        writing the monthly is what makes it useful — the GM
        who has to summarize the month for the owner thinks
        about the month differently than the GM who just lives
        through it.
      </p>
      <p>
        Cadence: report covers a calendar month and lands in
        the owner’s inbox by the 5th of the following month.
        Later than that and the report stops being timely;
        earlier than that and the late-month numbers have not
        settled.
      </p>
      <p>
        For multi-property groups: the same template at every
        property, same date, same five numbers, same four
        sections. Comparability across properties is worth more
        than per-property customization. When the templates
        differ, the owner cannot scan the portfolio; when they
        match, the owner reads three reports in 15 minutes.
        See{' '}
        <Link href="/blog/running-a-3-property-boutique-group">
          running a 3-property boutique group
        </Link>{' '}
        for more on this.
      </p>

      <h2>The underlying truth</h2>
      <p>
        The monthly report is not a deliverable for its own
        sake. It is the artifact that forces the GM and the
        owner to share a model of what is happening at the
        property. The version of the report that fails the
        owner also fails the GM — it does not surface the
        things the GM should be acting on. The version that
        works does both.
      </p>
      <p>
        The hardest part of writing a useful monthly is the
        discipline of leaving out everything that does not
        belong. Boutique GMs who learn to do that are the GMs
        who scale into multi-property roles cleanly. Owners
        who insist on it are the owners whose portfolios
        compound.
      </p>
    </>
  )
}
