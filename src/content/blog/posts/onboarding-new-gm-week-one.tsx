import Link from 'next/link'
import type { BlogPostModule } from '../types'

export const meta: BlogPostModule['meta'] = {
  slug: 'onboarding-new-gm-boutique-hotel-week-one',
  title:
    'Onboarding a new GM at a boutique hotel: a week-one playbook.',
  description:
    'New general managers at boutique hotels typically take 60–90 days to reach full operational fluency. Most of that time is spent rediscovering what the previous GM already knew. Here is the week-one playbook that cuts the ramp in half.',
  publishedAt: '2026-08-07',
  readingMinutes: 7,
  topic: 'Team',
  heroImage: '/AdobeStock_327436679.jpeg',
  heroAlt: 'Hotel reception desk during a calm morning shift',
}

export default function Post() {
  return (
    <>
      <p>
        At a boutique hotel, the GM is the operating system. They
        know the plumber. They know which room has the
        temperamental window. They know the regular who books
        every Tuesday and refuses to stay on the second floor.
        When they leave — and at boutique scale, they leave
        every 2–3 years on average — most of that operating
        knowledge leaves with them.
      </p>
      <p>
        The standard recovery time is 60–90 days. The new GM
        spends most of that quarter rediscovering what the
        previous GM already knew, asking the same questions in a
        slightly different order, and gradually accumulating
        their own version of the operating model in their own
        head. The owner spends the same quarter answering those
        questions while also doing their day job.
      </p>
      <p>
        It does not have to take that long. Here is what week
        one should actually look like — the structured handoff
        that compresses the ramp from 90 days to about 30, and
        leaves the new GM with a real operating model rather
        than a slowly-assembled folklore.
      </p>

      <h2>Before day one</h2>
      <p>
        The owner’s job before the new GM walks in is to make
        sure the operational knowledge has been written down
        somewhere the GM can read it without asking the previous
        GM. This is the single highest-leverage thing the owner
        can do for the handover, and it is the part most
        boutique groups skip.
      </p>
      <p>
        The minimum baseline:
      </p>
      <ul>
        <li>
          <strong>The vendor directory.</strong> Every plumber,
          electrician, linen supplier, food vendor, the espresso
          machine technician — names, contacts, contract terms,
          last-called dates. If this lives only in the outgoing
          GM’s phone, the operational continuity is at risk no
          matter how good the new hire is.
        </li>
        <li>
          <strong>The IT and credentials hub.</strong> Wi-Fi
          SSIDs and passwords, vendor portal logins, equipment
          serial numbers, warranty dates, floor plans. Role-gated
          so the new GM gets ownership-tier access on day one
          without rummaging through binders.
        </li>
        <li>
          <strong>The current open ticket queue.</strong> What
          maintenance issues are open, what their priority is,
          who owns them, what is blocked. The new GM should be
          able to walk in and see this as a single board, not
          assemble it from emails.
        </li>
        <li>
          <strong>The current event pipeline.</strong> Every
          inquiry, every proposal out, every contract signed for
          the next 6 months. Including the lost ones, with
          reasons.
        </li>
      </ul>
      <p>
        If your property has{' '}
        <Link href="/blog/10-ways-to-modernize-your-boutique-hotel#step-3">
          one source of truth for operational knowledge
        </Link>
        , day one is straightforward. If it does not, the next
        90 days are about building one — and a GM transition is
        usually the moment to do it.
      </p>

      <h2>Day one</h2>
      <p>
        Day one is not a property tour. The new GM has likely
        already seen the property at least twice during the
        hiring process. Day one is operational handover, and it
        should be done with the outgoing GM if they are still
        available, or with the owner if not.
      </p>
      <p>
        The morning is the dashboard walkthrough. Every
        operational surface the GM is going to use — the
        maintenance board, the events pipeline, the IT hub, the
        signage system, the guest arrival pages, the team
        access controls — gets demonstrated in the order the
        GM will encounter them in their first week. The
        afternoon is shadowing the front desk through a normal
        shift. The new GM is observing, not running anything yet.
      </p>
      <p>
        End of day one, the GM should be able to answer:
      </p>
      <ul>
        <li>Where do I see what is broken right now?</li>
        <li>Where do I see what events are coming up?</li>
        <li>How do I get hold of the plumber at 11pm?</li>
        <li>Who at this property has owner-tier authority?</li>
        <li>What is the GM’s personal email and on-call number?</li>
      </ul>
      <p>
        If the new GM cannot answer all five at the end of day
        one, you are already running behind on the ramp.
      </p>

      <h2>Days two through four</h2>
      <p>
        Days two through four are the practical workflow drill.
        The new GM, with the outgoing GM or owner alongside,
        actually runs the workflows. Not just watching — doing.
      </p>
      <p>
        Day two is maintenance. Take a real photo of a real
        broken thing in the property. File the ticket. Assign
        it. Close it with an after-photo. Look at the audit log.
        This is the workflow the GM will run dozens of times a
        week; they should run it cold on day two.
      </p>
      <p>
        Day three is events. Walk through the events pipeline.
        Take a real inquiry (or a recent one) and generate the
        proposal end-to-end. Send it. Watch the signature
        flow. Look at the lost-inquiry data from the previous
        quarter; understand the loss reasons.
      </p>
      <p>
        Day four is the team and the calendar. The new GM
        introduces themselves to every staff member at every
        position, on shift. They run a shift handoff. They sit
        in on a housekeeping morning meeting. They learn the
        names of the regulars who come to the breakfast service.
        This is the cultural part of the handover, and it
        cannot be rushed.
      </p>

      <h2>Day five — the operational audit</h2>
      <p>
        End of week one, before the new GM is left running
        anything solo, walk the property with them in the role
        of operational auditor. Phone in hand. Scan every QR
        card in every room. Watch every signage screen for a
        full minute. Read every printed card you would have read
        as a guest. Note every cosmetic and functional issue
        into the maintenance system as you go.
      </p>
      <p>
        Two things come out of this walk. First, the new GM has
        an accurate-in-this-moment picture of the property’s
        actual state — not the state in the owner’s head from
        six months ago. Second, the new GM has run the monthly
        tech walk that should be a recurring part of their job,
        with a partner, before doing it alone. The walk becomes
        the model for how the GM does it every month going
        forward.
      </p>

      <h2>What week one should not include</h2>
      <p>
        Three things consistently show up in boutique GM
        handovers that should not. They are popular because they
        feel productive; they are skippable because they are
        not.
      </p>
      <p>
        <strong>The complete history of the property.</strong>{' '}
        The new GM does not need to know that the carpet was
        replaced in 2019 by a vendor who later went out of
        business. They need to know what the carpet looks like
        today and who replaces it next. Save the history for
        month two, when curiosity drives the question.
      </p>
      <p>
        <strong>Every edge case in the PMS.</strong> The PMS is
        complex. Every PMS is. The new GM will learn the
        80% of the system that handles 99% of the work in
        their first two weeks. The remaining 20% (corporate
        rate codes that have not been used since 2022, the
        loyalty program from a previous management group)
        can wait until they encounter it.
      </p>
      <p>
        <strong>An exhaustive brand bible.</strong> The new GM
        needs to know the brand voice and the brand colors and
        the brand standards for what goes on a public surface.
        They do not need the 60-page brand bible on day five.
        Give them the one-pager; the rest is reference.
      </p>

      <h2>What good looks like at day 30</h2>
      <p>
        With the structured handover above, the new GM at day
        30 should be:
      </p>
      <ul>
        <li>
          Running every operational workflow without owner
          intervention — maintenance, events, vendors,
          signage updates, arrival page edits.
        </li>
        <li>
          Hosting a weekly review with the owner that the
          owner does not have to drive — the GM brings the
          numbers, the GM brings the open questions.
        </li>
        <li>
          Closing on event inquiries within the same response
          window the outgoing GM was hitting.
        </li>
        <li>
          Identifying the two or three operational changes
          they want to propose, having lived in the system
          long enough to know where the friction actually is.
        </li>
      </ul>
      <p>
        Most boutique groups we have walked through this
        structured handover land somewhere in the 25-to-40 day
        window for full operational fluency, versus the
        60-to-90 day window for the ad-hoc approach. The
        compounding effect over a year is dramatic: an extra
        month of a fully-productive GM is worth substantially
        more than the cost of structuring the handover.
      </p>

      <p className="text-sm text-subtle">
        The handover gets dramatically harder if the
        operational knowledge has not been centralized before
        the previous GM leaves. The{' '}
        <Link href="/blog/10-ways-to-modernize-your-boutique-hotel">
          10-ways modernization guide
        </Link>{' '}
        covers what that operational layer should look like.
        For groups running multiple properties, the same
        handover playbook applies at each property — see{' '}
        <Link href="/blog/running-a-3-property-boutique-group">
          running a 3-property boutique group
        </Link>{' '}
        for the cross-property version.
      </p>
    </>
  )
}
