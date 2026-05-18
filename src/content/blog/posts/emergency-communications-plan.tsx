import Link from 'next/link'
import type { BlogPostModule } from '../types'

export const meta: BlogPostModule['meta'] = {
  slug: 'boutique-hotel-emergency-communications-plan',
  title:
    'The boutique hotel emergency communications plan that actually works.',
  description:
    'Fire, flood, weather evacuation, neighborhood incident — these are the moments boutique properties either handle well or improvise badly. Here is the communications plan shape that costs nothing to set up and stays useful for the one day it matters.',
  publishedAt: '2026-09-18',
  readingMinutes: 6,
  topic: 'Operations',
  heroImage:
    'https://images.unsplash.com/photo-1673388756897-28832439e9aa?w=1200&q=80&auto=format&fit=crop',
  heroAlt: 'Hotel signage illuminated at night',
}

export default function Post() {
  return (
    <>
      <p>
        Most boutique hotels have a fire evacuation plan posted
        on the back of every guest room door because the law
        requires it. Most boutique hotels do not have a
        communications plan for what to actually do during the
        evacuation, the gas leak, the severe weather warning,
        the active-incident-in-the-neighborhood call from the
        local police. The first one is a regulatory artifact.
        The second one is what determines how the night goes.
      </p>
      <p>
        Chain hotels treat this as a baseline operational
        capability. Boutiques mostly do not — until the one
        night they need it and discover, in real time, that the
        plan they assumed existed does not. Here is the
        communications plan shape that costs almost nothing to
        set up and stays useful for the one day it matters.
      </p>

      <h2>The four channels</h2>
      <p>
        Emergency communications at a boutique property flow
        through four channels, and the plan is mostly about
        making sure each one is ready to be used the moment
        it is needed.
      </p>
      <ul>
        <li>
          <strong>Every screen at the property.</strong> Lobby
          boards, breakroom displays, pool deck signs, meeting
          room screens. If you have digital signage at all,
          this is the loudest broadcast channel you have.
        </li>
        <li>
          <strong>The staff phone tree.</strong> A defined
          order of who calls who, with backup numbers, that
          works whether the incident starts at 11am or 3am.
        </li>
        <li>
          <strong>The in-room phone or door cards.</strong> For
          guests already in their rooms when an event starts.
          The PMS may or may not be the right tool for this;
          most are not designed for emergency broadcast.
        </li>
        <li>
          <strong>The front desk script.</strong> What the
          person at the desk says to a guest who walks up and
          asks what is going on.
        </li>
      </ul>
      <p>
        Each of these has a normal state and an emergency state.
        The plan is mostly about getting the emergency state
        ready before you need it, so the staff member on shift
        does not have to invent it in the moment.
      </p>

      <h2>The pre-built templates</h2>
      <p>
        Most boutique emergencies fall into a small set of
        scenarios. The plan should pre-build the templates for
        each one — written, reviewed, and stored in the same
        operational system that runs the signage and ticket
        flow. Five scenarios cover almost everything:
      </p>
      <ul>
        <li>
          <strong>Fire alarm.</strong> Calm, directive. Evacuate
          via stairs, do not use elevators, meet at the
          designated assembly point.
        </li>
        <li>
          <strong>Weather event (hurricane, severe storm,
          earthquake aftershock).</strong> Shelter-in-place
          instructions. Where is the safest part of the building.
          When will the next update be issued.
        </li>
        <li>
          <strong>Gas leak / utility incident.</strong>{' '}
          Evacuate, do not use electrical switches, do not
          use elevators. Meeting point and reentry timing.
        </li>
        <li>
          <strong>Active incident in the neighborhood.</strong>{' '}
          Shelter-in-place. Do not exit the property. The
          front desk is the source of updates.
        </li>
        <li>
          <strong>All-clear.</strong> Issued only by the GM or
          designated incident lead. Same channels as the
          original alert.
        </li>
      </ul>
      <p>
        Pre-built does not mean exhaustive. The templates are
        ~50–80 words each, written for legibility on a phone
        and on a digital screen, in the language of your
        primary guest demographic.
      </p>

      <h2>Who can push the broadcast</h2>
      <p>
        The most common failure mode in boutique emergency
        communications is not the technology. It is the
        question of who has the authority to push the
        broadcast. The fire alarm is going. The person at the
        front desk is alone. They open the dashboard. They are
        not sure if they are allowed to push the emergency
        template to every screen. They call the GM. The GM is
        not picking up. By the time someone with explicit
        authority is on the system, the moment has passed.
      </p>
      <p>
        The fix is upstream: the plan names, by role, who has
        broadcast authority on shift. The front desk supervisor
        on the schedule. The night manager. The duty manager.
        Anyone in those roles can push any of the templates the
        moment they confirm the incident, without escalation.
      </p>
      <p>
        Concretely: write down which roles can broadcast. Train
        the people in those roles on the system once. Run a
        tabletop drill quarterly so the front desk supervisor
        does not freeze the one night it matters.
      </p>

      <h2>The phone tree</h2>
      <p>
        Almost every boutique already has an informal phone
        tree. The problem is that it lives in the GM’s head
        and breaks the moment the GM is the one who is
        unreachable. The formal phone tree solves this:
      </p>
      <ul>
        <li>
          The person who detects the incident calls Tier 1.
        </li>
        <li>
          Tier 1 (front desk supervisor or duty manager)
          confirms and pushes the broadcast.
        </li>
        <li>
          Tier 1 calls Tier 2 (GM, owner). If Tier 1 cannot
          reach Tier 2 within 5 minutes, they proceed without
          and report after.
        </li>
        <li>
          Tier 2 takes over coordination. Tier 1 returns to the
          front-desk duties.
        </li>
      </ul>
      <p>
        Two notes. First: the phone tree only works if the
        numbers are current. Phone numbers should be reviewed
        every quarter and updated within a week of any staff
        change. Most boutique trees we have seen had at least
        one wrong number; the wrong number was always for the
        person nobody had called recently.
      </p>
      <p>
        Second: the tree should be on paper somewhere at the
        front desk, not just in the digital system. The
        scenario where the network is also down is rare but
        real, and the paper copy is the fallback that
        eliminates that failure mode.
      </p>

      <h2>The quarterly drill</h2>
      <p>
        Pre-built templates and a written phone tree do not
        survive contact with reality unless they are
        exercised. A quarterly drill is the discipline that
        keeps the plan useful. Twenty minutes. Pick a
        scenario. Walk through it as a tabletop — no actual
        broadcasts pushed, but every staff member on shift
        narrates what they would do.
      </p>
      <p>
        Three things tend to come out of the first drill at
        every property: a missing phone number, a template
        the staff has never read before, and a role with no
        clear broadcast authority. All three are cheap to fix
        in advance and expensive to discover in the moment.
      </p>

      <h2>Where the system actually lives</h2>
      <p>
        For the plan to be operational rather than aspirational,
        it needs to live somewhere the front desk can reach in
        90 seconds. The right place is the same operational
        system that runs your maintenance board and signage —
        the templates are stored alongside the screens they
        push to; the phone tree is in the same IT hub as the
        Wi-Fi credentials and vendor logins; the broadcast
        authority is in the same role permissions that govern
        the rest of the back office.
      </p>
      <p>
        The wrong place is a binder in the back office, a Drive
        folder titled “Emergency Plan v4 (DRAFT)”, or a poster
        on the wall behind the front desk that nobody has
        looked at since 2022. Those formats survive nothing.
        For the broader argument on consolidating operational
        knowledge into a single source of truth, see{' '}
        <Link href="/blog/10-ways-to-modernize-your-boutique-hotel#step-3">
          step 3 of the modernization guide
        </Link>
        .
      </p>

      <h2>The cost of doing this</h2>
      <p>
        The communications plan above takes about a day to
        write, review, and load into your operational system.
        The quarterly drill takes 20 minutes. The total
        ongoing time investment is roughly an hour a year.
      </p>
      <p>
        The cost of not doing it is invisible until the night
        it is needed. The properties that handle these nights
        well — and they happen at every boutique that operates
        long enough — are the ones that did the cheap work in
        advance. Treat this as the safety surface it is, not
        as a checklist for the licensing inspection.
      </p>

      <p className="text-sm text-subtle">
        Step 7 of the broader modernization playbook covers
        the technical side of emergency broadcast across every
        screen at the property — see{' '}
        <Link href="/blog/10-ways-to-modernize-your-boutique-hotel#step-7">
          the field guide
        </Link>{' '}
        for the full context.
      </p>
    </>
  )
}
