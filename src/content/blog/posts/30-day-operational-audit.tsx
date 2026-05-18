import Link from 'next/link'
import type { BlogPostModule } from '../types'

export const meta: BlogPostModule['meta'] = {
  slug: 'boutique-hotel-30-day-operational-audit',
  title:
    'Inheriting a boutique hotel: the 30-day operational audit.',
  description:
    'New owners of a boutique hotel typically discover the real operational state of the property somewhere in month three — long after the moment when the discovery would have been most useful. Here is the 30-day audit that surfaces it on day one instead.',
  publishedAt: '2026-11-13',
  readingMinutes: 8,
  topic: 'Multi-property',
  heroImage:
    'https://images.unsplash.com/photo-1649731000184-7ced04998f44?w=1200&q=80&auto=format&fit=crop',
  heroAlt: 'Hotel corridor with artwork during a property walk-through',
}

export default function Post() {
  return (
    <>
      <p>
        The first 30 days after acquiring a boutique hotel are
        the cheapest 30 days you will ever have to discover
        what is actually wrong with it. Vendors are eager to
        meet the new owner. Staff are open to questions they
        will not answer as candidly six months from now.
        Operational artifacts have not yet been buried under
        your own decisions. Everything that is broken is the
        previous owner’s problem, not yet yours; everything
        you decide to fix is on your terms.
      </p>
      <p>
        Most new boutique owners spend this month meeting the
        team, learning the brand, and walking the property —
        all valuable, all expected. What most miss is the
        structured operational audit that, done in the same
        30 days, would tell them what they are actually
        working with. This is that audit.
      </p>

      <h2>Week one: the inventory</h2>
      <p>
        Before any analysis, you need a clear picture of what
        the property is operationally composed of. The audit
        starts with five inventories, each of which usually
        takes a half day to two days to assemble.
      </p>
      <p>
        <strong>The vendor inventory.</strong> Every active
        vendor relationship — plumber, electrician, linen,
        food suppliers, software subscriptions, payment
        processor, channel manager, insurance, pest control,
        cleaning chemical supplier, equipment maintenance.
        Name, contact, contract end date, monthly cost,
        last-called date. Most properties cannot produce this
        list on day one; the act of building it surfaces
        relationships nobody had documented.
      </p>
      <p>
        <strong>The software inventory.</strong> Every recurring
        software charge on the corporate card or the property
        AP. The PMS, the booking engine, the channel manager,
        the maintenance tool, the signage subscription, the
        guest concierge platform, the document storage, the
        email service, the team chat, the survey tool, the
        accounting integration. Most properties run 8–14
        subscriptions and the owner remembers 5–6 of them.
        See{' '}
        <Link href="/blog/10-ways-to-modernize-your-boutique-hotel#step-8">
          step 8 of the modernization guide
        </Link>{' '}
        for the consolidation pattern; this audit is the prerequisite.
      </p>
      <p>
        <strong>The equipment inventory.</strong> Every piece
        of capital equipment with a warranty status and last-
        service date. Boilers, kitchen units, HVAC, elevators,
        pool equipment, laundry equipment, IT hardware. The
        warranty dates are where the surprises hide; properties
        regularly discover expired warranties or undocumented
        capital repairs from before the transaction closed.
      </p>
      <p>
        <strong>The credentials inventory.</strong> Every Wi-Fi
        password, every vendor portal login, every cloud
        service the property uses. Most acquired boutiques
        have shared logins floating around staff phones — the
        audit identifies them so they can be rotated. Treat
        the rotation as part of the close, not as a future
        project.
      </p>
      <p>
        <strong>The reservation snapshot.</strong> What is
        booked for the next 90 days, what is on hold, what
        large blocks (events, corporate, weddings) are
        scheduled. This is the only inventory the PMS owns;
        the others are the PMS’s blind spots.
      </p>

      <h2>Week two: the conversations</h2>
      <p>
        With the inventory in hand, the second week is
        targeted conversations. Three categories:
      </p>
      <p>
        <strong>Staff.</strong> Every staff member at every
        position, on shift. Not group meetings — one-on-one,
        15 minutes each. The two questions that produce the
        most useful answers: “What works really well here
        that you would not want changed?” and “What is the
        thing you have been hoping someone would fix?” Both
        questions surface answers the previous owner did not
        get because the staff were not willing to give them
        to the previous owner.
      </p>
      <p>
        <strong>Top vendors.</strong> The five or six vendors
        with the largest monthly spend or the highest
        operational dependency. A 20-minute call each. Are
        the contract terms still appropriate. What did the
        previous owner negotiate. Are there any pending
        invoices or open issues you should know about. Where
        is the relationship.
      </p>
      <p>
        <strong>Three to five recent guests.</strong> If you
        can — usually you can — reach out to three to five
        guests from the past 60 days, including one repeat
        guest and one one-night first-timer. A short note
        introducing yourself as the new owner and asking what
        the property could do better. You will get useful
        answers. The staff filter you out of those answers in
        a way reviews do not.
      </p>

      <h2>Week three: the operational walk</h2>
      <p>
        With the inventories and the conversations as
        background, the third week is operational discovery
        from the inside. Three exercises:
      </p>
      <p>
        <strong>Walk the property with a phone.</strong> The
        full tech walk —{' '}
        <Link href="/blog/10-ways-to-modernize-your-boutique-hotel#step-10">
          step 10 of the modernization guide
        </Link>{' '}
        — done in audit mode. Scan every QR card. Watch every
        screen. Read every printed card. Click every link.
        Note everything broken into one running list. The
        list becomes the day-one maintenance backlog you
        inherit.
      </p>
      <p>
        <strong>Sit through one full housekeeping rotation.</strong>{' '}
        Be present from the moment housekeeping arrives in
        the morning to the moment the last room is reported
        Ready in the afternoon. You will learn more about
        how the property actually runs in this single day
        than from any document you will read in the first
        month.
      </p>
      <p>
        <strong>Run the front desk for a check-in wave.</strong>{' '}
        Not as decoration; do the actual work, with the
        regular staff alongside. Run a couple of check-ins.
        Field a guest complaint. Use the PMS. You will find
        out which workflows are easy, which are baroque, and
        which the staff have invented workarounds for. The
        workarounds are usually the most informative.
      </p>

      <h2>Week four: the synthesis</h2>
      <p>
        The fourth week is sitting down with everything you
        have collected and producing the document you wish
        you had on day one. Two artifacts:
      </p>
      <p>
        <strong>The 90-day priority list.</strong> Three to
        five operational changes you want to make in the next
        quarter, in priority order, with a brief rationale
        and a cost estimate for each. Almost always at least
        one of these is unifying scattered operational
        knowledge into a single source of truth (see{' '}
        <Link href="/blog/10-ways-to-modernize-your-boutique-hotel">
          the 10-ways guide
        </Link>{' '}
        for the full pattern). Another is usually consolidating
        the software stack. The remaining one or two are
        property-specific.
      </p>
      <p>
        <strong>The vendor and software cleanup plan.</strong>{' '}
        For each line item in the software and vendor
        inventories: keep, consolidate, renegotiate, or
        cancel. Date each action. Bundle them into a single
        90-day project so they happen on a schedule rather
        than as they come up.
      </p>

      <h2>What new owners consistently find</h2>
      <p>
        Across boutique acquisitions we have seen, the same
        patterns recur in the first 30-day audit:
      </p>
      <ul>
        <li>
          At least one expired vendor contract that has been
          auto-renewing for years past the point where the
          terms were market.
        </li>
        <li>
          Two to four software subscriptions nobody is
          actively using; one of them on a multi-year contract.
        </li>
        <li>
          A piece of capital equipment with a warranty that
          expired in the last 18 months and was never
          renewed.
        </li>
        <li>
          A maintenance backlog twice the size the previous
          owner believed it to be — the visible part was
          backed up by an invisible part nobody had
          captured.
        </li>
        <li>
          A guest impression issue (signage looking stale,
          arrival page out of date, in-room information
          wrong) that the previous owner stopped seeing
          because they had been seeing it daily for too
          long.
        </li>
      </ul>
      <p>
        None of these are catastrophic individually. Cumulatively,
        they are the difference between an acquisition that
        produces operating leverage in year one and one that
        spends year one absorbing the deferred maintenance
        debt the previous owner did not disclose.
      </p>

      <h2>What not to do in the first 30 days</h2>
      <p>
        Three temptations every new boutique owner faces:
      </p>
      <p>
        <strong>Replacing the GM.</strong> The previous GM
        knows things you do not, and the cost of replacing
        them in month one is much higher than the cost of
        waiting until month four to make a more informed
        decision. Run the audit with them, not around them.
      </p>
      <p>
        <strong>Migrating the PMS.</strong> The PMS is the
        nervous system of the property. Migrating it in the
        first quarter, when you do not yet know what
        integrations and workflows depend on it, is one of
        the few transactional mistakes a boutique owner can
        make. The first quarter is for understanding, not
        for replatforming. (And if migration is inevitable
        long-term, the modernization moves around the PMS
        come first — see{' '}
        <Link href="/blog/pms-is-not-your-operations-system">
          your PMS is not your operations system
        </Link>{' '}
        for the framing.)
      </p>
      <p>
        <strong>Rebranding.</strong> The brand is the part of
        the property you can change most cheaply and the part
        guests notice most slowly. Spend the first 30 days
        understanding what the brand is actually delivering
        before deciding what it should become.
      </p>

      <h2>The compounding effect</h2>
      <p>
        Owners who run the 30-day audit consistently come out
        of the first quarter with two assets the owners who
        skip it do not have: a clear list of what is real,
        and a documented baseline they can measure future
        changes against. The two together compound into
        year-one decisions that produce operating leverage,
        not operating drag.
      </p>
      <p>
        The 30 days of audit work cost nothing besides time.
        Skipping it costs the first year of ownership. It is
        one of the simplest tradeoffs in the boutique
        operating model and one of the most consistently
        misjudged.
      </p>
    </>
  )
}
