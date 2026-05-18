import Link from 'next/link'
import type { BlogPostModule } from '../types'

export const meta: BlogPostModule['meta'] = {
  slug: 'hotel-maintenance-ticket-that-closes',
  title:
    'The Hotel Maintenance Ticket That Actually Closes — What the Back of the Workflow Needs to Look Like.',
  description:
    'Most boutique hotel maintenance lives in WhatsApp threads, paper logbooks, and the GM’s memory. Here is the workflow shape that moves the median fix from 2–3 days to under 4 hours — without buying enterprise software.',
  publishedAt: '2026-05-29',
  readingMinutes: 8,
  topic: 'Operations',
  heroImage:
    'https://images.unsplash.com/photo-1581783898377-1c85bf937427?w=1200&q=80&auto=format&fit=crop',
  heroAlt: 'Hand tools laid out for a hotel maintenance task',
}

export default function Post() {
  return (
    <>
      <p>
        Walk into the back office of any boutique hotel and the
        maintenance system reveals itself within five minutes. There
        is a paper logbook, a WhatsApp thread, a sticky note on the
        engineering manager’s monitor, and a Google Doc that someone
        last updated in February. Each of these claims to be the
        ticket queue. None of them are. The actual queue lives in the
        head of whoever happens to be on shift.
      </p>
      <p>
        This is the part of operations boutique GMs spend the most
        hours on, and the part guests notice the most quickly. A
        broken kettle, a flickering bulb, a tile that came loose in
        the shower — none of these are individually expensive
        problems. Collectively, they are the difference between a
        property that reads as “well-run” to guests and one that
        reads as “charming but a little chaotic.”
      </p>
      <p>
        The good news is that the workflow shape that fixes this is
        well understood and inexpensive. Below is what a maintenance
        ticket should actually look like at a boutique property in
        2026, broken down by the four moments that decide whether it
        closes in hours or in days.
      </p>

      <h2>Moment 1: the capture</h2>
      <p>
        The ticket exists if and only if it gets captured. At most
        boutique properties, the capture is a verbal handoff —
        housekeeping mentions the broken kettle to the front desk on
        the way out, the front desk passes it to engineering during
        the shift change, engineering remembers it about 30% of the
        time. The leak between “noticed” and “captured” is where
        most of the cycle time goes, and it is almost always larger
        than the operator realizes.
      </p>
      <p>
        The fix is operational, not technological. The rule is:
        whoever notices the issue captures it, and the capture
        starts with a photo. A photo collapses the gap between “the
        kettle in 312 is broken” and “fix this specific kettle by
        3 PM” — and more importantly, it forces the capture to
        happen at the moment of noticing, while the staff member is
        still in the room. A photo also eliminates the back-and-forth
        of clarifying what is actually broken.
      </p>
      <p>
        Capture should take under 10 seconds. If it takes longer
        than that, your front desk and your housekeepers will not
        do it consistently, and the system collapses back into a
        verbal-handoff workflow.
      </p>

      <h2>Moment 2: the assignment</h2>
      <p>
        Every ticket needs three pieces of information beyond the
        photo: the room or area, the priority, and the owner. Most
        boutique workflows nail the room number and skip the other
        two — which is why so many tickets sit in limbo. A ticket
        without an owner is not a ticket; it is a complaint.
      </p>
      <p>
        Priority should be three levels at most. Properties that
        try to run five-tier priority systems end up with everything
        marked “medium” and nothing actually getting triaged. The
        useful three:
      </p>
      <ul>
        <li>
          <strong>Urgent — guest in room.</strong> The fix needs to
          happen before the guest gets back. This is most of what
          guests will ever notice.
        </li>
        <li>
          <strong>Today — room turn.</strong> The fix needs to
          happen before the next check-in to that room.
        </li>
        <li>
          <strong>This week — backlog.</strong> Non-blocking issues
          that compound if ignored — preventive maintenance, minor
          cosmetic things, anything that can wait for the
          engineering team’s scheduled rounds.
        </li>
      </ul>
      <p>
        Ownership should default to a single named person, not a
        team or a queue. At boutique scale, the engineering team
        is often one or two people; assigning to “engineering” is
        the same as assigning to no one. Pick a name. The named
        person can hand it off explicitly; what you cannot do is
        let it sit unowned.
      </p>

      <h2>Moment 3: the fix</h2>
      <p>
        The fix is the boring part of the ticket. By the time you
        have a tagged photo, a priority, and an owner, the fix
        usually happens. The thing that goes wrong here is not the
        physical repair — it is the communication around it.
      </p>
      <p>
        Guests who reported an issue should be told when it has
        been resolved. A front desk staff member who looked at the
        kettle and confirmed it was broken should know when it is
        fixed so they do not have to chase it down themselves
        later. Owners should be able to see, at the end of the
        week, what closed and what is still open without asking
        anyone.
      </p>
      <p>
        The mechanism: every status change is timestamped and
        visible to anyone with access to the ticket. The front
        desk who reported it can see “engineering accepted,”
        “in progress,” “closed.” The GM does not have to be the
        radio relay between front desk and engineering. This is
        the part of the workflow that genuinely requires software
        — paper cannot do it, and group chats do it badly.
      </p>

      <h2>Moment 4: the close-out</h2>
      <p>
        The most-skipped moment of any maintenance workflow is the
        close-out. The kettle is fixed. The status is marked
        closed. And nothing happens after that, because nothing
        was set up to.
      </p>
      <p>
        Two things should happen at close-out, and they together
        compound into most of the long-term value of running a
        proper maintenance system:
      </p>
      <p>
        <strong>An after-photo.</strong> Engineering uploads a
        photo of the fixed thing. This is not bureaucracy. The
        after-photo collapses the gap between “marked complete”
        and “actually complete,” which is the gap that eats your
        weekends when a guest complains about the same issue two
        nights later. The audit log shows the before, the
        in-progress, and the after — and the owner can scan a
        month of tickets and see real evidence of resolution.
      </p>
      <p>
        <strong>A pattern check.</strong> Once a week, look at the
        ticket history grouped by room and grouped by category.
        Three plumbing tickets in 218 in six weeks is not a series
        of accidents; it is a sign that the next preventive plumber
        visit needs to start in that room. You will not see this
        pattern in a paper logbook. You see it the moment a ticket
        system is the source of truth.
      </p>

      <h2>What the numbers actually look like</h2>
      <p>
        We have walked operators through this workflow change at
        properties from 24 rooms to 78 rooms. The numbers are
        consistent enough to quote a range. At a 40-room property
        that had been running maintenance on paper or WhatsApp,
        moving to the four-moment workflow above typically
        produces:
      </p>
      <ul>
        <li>
          Median resolution time drops from 2–3 days to under 4
          hours.
        </li>
        <li>
          GM reclaims 4–6 hours a week — most of it was being
          spent re-asking, re-clarifying, and re-chasing tickets.
        </li>
        <li>
          Negative reviews mentioning maintenance issues drop by
          roughly 50% over the first quarter.
        </li>
        <li>
          Preventive maintenance gets done on schedule for the
          first time, because the pattern check surfaces it.
        </li>
      </ul>
      <p>
        None of these are individually dramatic. Collectively, they
        are the difference between a property that runs itself and
        a property that runs the GM into the ground.
      </p>

      <h2>What you actually need to buy</h2>
      <p>
        The honest answer is: any modern hotel maintenance system
        will enforce the four moments above. The legacy options
        (Quore at around $130/month per property, HotSOS at
        $200–$500/month) do this competently, with the caveat that
        their pricing punishes small properties and their
        implementations assume an IT department. A unified back-office
        layer — like the maintenance module bundled into the
        MyHotelOps $100/property base — does the same job alongside
        the other operational surfaces a boutique needs.
      </p>
      <p>
        What matters is not the brand. It is that the workflow
        enforces the photo, the room tag, the priority, the owner,
        the after-photo, and the audit log. Any tool that does all
        six is enough. The boutique segment has spent two decades
        trying to make spreadsheets do this, and spreadsheets do
        none of them well. The shift is overdue.
      </p>

      <p className="text-sm text-subtle">
        For the broader context on why boutique hotels have lagged
        the chains on this kind of operational tooling, see{' '}
        <Link href="/blog/boutique-hotel-tech-modernization-gap">
          the boutique hotel tech modernization gap
        </Link>
        . For the full ten-move modernization playbook,{' '}
        <Link href="/blog/10-ways-to-modernize-your-boutique-hotel">
          read the field guide
        </Link>
        .
      </p>
    </>
  )
}
