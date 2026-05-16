import type { BlogPostModule } from '../types'

export const meta: BlogPostModule['meta'] = {
  slug: 'pms-is-not-your-operations-system',
  title:
    'Your PMS is not your operations system. Here is what is.',
  description:
    'Mews, Cloudbeds, Opera, Little Hotelier — every PMS in the boutique segment is excellent at the thing it was built for. None of them are an operations system, and the gap is bigger than most operators realize until they look at it directly.',
  publishedAt: '2026-05-10',
  readingMinutes: 7,
  topic: 'PMS',
  heroImage: '/AdobeStock_327436679.jpeg',
  heroAlt: 'Boutique hotel reception desk where the PMS lives',
}

export default function Post() {
  return (
    <>
      <p>
        Ask a boutique hotel operator what software runs their
        property and the answer is almost always the PMS. Mews,
        Cloudbeds, Opera, Little Hotelier, RoomRaccoon, Cloudbeds,
        Hotelogix — whichever name they say, the operator thinks of
        it as the system. They were sold it as the system.
      </p>
      <p>
        It is not the system. It is one system. And the gap between
        what the PMS does and what running a hotel actually requires
        is wider than most operators have time to map out — until
        the day they try to find last winter’s wedding contract, or
        chase down the warranty on a dead kitchen unit, or push an
        emergency message to the lobby screen, and realize the PMS
        does none of that.
      </p>

      <h2>What a PMS is actually for</h2>
      <p>
        Property management systems are excellent at one job and
        adjacent to a few others. The core job is reservations:
        availability, rates, the booking record, the folio, the
        room assignment, the night audit, the check-in and
        check-out. The adjacent jobs are channel management
        (distributing inventory to the OTAs), payments
        (tokenizing the card on file), and the most basic guest
        record (name, stay history, notes).
      </p>
      <p>
        Every modern PMS does these things competently. The good
        ones do them very well. Mews has a beautiful UI. Cloudbeds
        has a deep integration catalog. Opera has the deepest
        enterprise feature set. Little Hotelier has the cleanest
        small-property pricing. Picking among them is a real
        decision and we are not here to weigh in on it.
      </p>
      <p>
        We are here to say this: whichever one you pick, it covers
        the reservation surface and a little around it. Everything
        else at your property is, by default, off-system.
      </p>

      <h2>What lives off the PMS</h2>
      <p>
        Take an honest inventory of what actually happens at a
        boutique property in a week, and look at how much of it
        the PMS touches:
      </p>
      <ul>
        <li>
          <strong>Maintenance work orders.</strong> The chipped
          tile in 312, the dripping faucet in 207, the lobby
          chair with the wobbly leg. Your PMS does not have a
          ticket system. The PMS housekeeping module, if it has
          one, tracks room status, not engineering tasks.
        </li>
        <li>
          <strong>Event and catering inquiries.</strong> The
          wedding party for August, the corporate offsite, the
          private dinner in the back room. Inquiry, proposal,
          revisions, signed contract, invoice. None of this
          lives in the PMS. Most boutiques run it in Word and
          email.
        </li>
        <li>
          <strong>Vendor records.</strong> Your plumber, your
          electrician, your linen supplier, your food vendor,
          your locksmith, your pest control. Contacts, contract
          terms, last-called dates. Your PMS does not know any
          of this exists.
        </li>
        <li>
          <strong>Equipment, warranties, and IT records.</strong>
          The kitchen units with their serial numbers and
          warranty dates. The Wi-Fi credentials for each network.
          The portal logins for every vendor service. None of
          this lives in the PMS.
        </li>
        <li>
          <strong>Digital signage.</strong> Every screen at the
          property — lobby boards, breakroom displays, pool
          deck signs, meeting room screens. The PMS does not run
          any of them.
        </li>
        <li>
          <strong>Guest arrival information.</strong> The Wi-Fi
          password, the restaurant menus, the spa hours, the
          neighborhood guide, the printable QR card in every
          room. Most PMS guest portals do a watered-down version
          of this if they do it at all.
        </li>
        <li>
          <strong>Floor plans, brand assets, document
          storage.</strong> The hotel’s evacuation map, the
          brand guidelines, the licensed photos for marketing
          use, the supplier contracts. All of it lives in
          someone’s Drive folder.
        </li>
      </ul>
      <p>
        This is what we mean when we say the PMS is not your
        operations system. The reservation surface is one slice
        of running a hotel. The list above is the rest of it,
        and it is the part that consumes most of a boutique GM’s
        week.
      </p>

      <h2>What an operations system is, then</h2>
      <p>
        An operations system is the layer that handles
        everything above. It does not replace the PMS. It does
        not sync with the PMS. It does not need to. The PMS
        owns reservations and the data that hangs off them; the
        operations system owns everything else, and the two
        coexist without one trying to be the other.
      </p>
      <p>
        Concretely, an operations system holds your maintenance
        tickets, your event pipeline, your vendor directory,
        your equipment and warranty records, your Wi-Fi and
        portal credentials, your floor plans and brand assets,
        your digital signage, your branded guest arrival pages,
        your unified team access — all in one place, with one
        login, on one flat per-property bill.
      </p>
      <p>
        The way to know whether you have one already is to ask
        a simple question: when something on the property
        breaks, fails an inspection, or needs to be coordinated
        across staff, where does the team go first? If the
        answer is “to a Drive folder, a WhatsApp thread, or a
        binder behind the front desk,” you do not have an
        operations system. You have a PMS and a stack of
        improvisations around it.
      </p>

      <h2>Why this matters now</h2>
      <p>
        For 20 years, the gap between PMS and operations was
        the cost of doing business at a boutique. Filling it
        meant either paying for half a dozen standalone tools
        with bad pricing for small properties, or running it on
        paper and spreadsheets. Most operators chose the
        paper-and-spreadsheets path. It was rational.
      </p>
      <p>
        In 2026 it is no longer rational, for two reasons.
        First, the operational tax of running off paper has
        gone up — staff turnover is faster, guest expectations
        are higher, and the cost of a missed maintenance ticket
        in a review-driven market is measurable in revenue.
        Second, the cost of buying a unified operations layer
        has come down to a number that fits inside a real
        boutique software budget.
      </p>
      <p>
        The properties that figure this out first do not
        replace their PMS. They keep it, because it is good at
        what it does. They add an operations layer next to it,
        for everything else, and they spend the next two years
        watching the gap widen on the properties still patching
        spreadsheets onto a PMS.
      </p>

      <h2>Picking one</h2>
      <p>
        If you are evaluating an operations system, three
        things matter more than the feature checklist. First,
        the pricing should be per-property, not per-seat or
        per-screen, because the alternative re-creates the
        budget problem that put you in spreadsheets in the
        first place. Second, the surface should be unified
        rather than a marketplace of integrations, because
        every integration is a tax on your team. Third, it
        should not pretend to be a PMS — if a vendor’s answer
        to “do you sync with Mews?” is “we replace it,” walk
        away. The good ones sit next to your PMS, not on top
        of it.
      </p>
      <p>
        The PMS owns the booking. The operations system owns
        the rest. Both can be excellent at their respective
        jobs without one trying to swallow the other. That is
        the back office every boutique should be running on.
      </p>
    </>
  )
}
