import Link from 'next/link'
import type { BlogPostModule } from '../types'

export const meta: BlogPostModule['meta'] = {
  slug: 'guest-concierge-app-cost-2026',
  title:
    'The true cost per occupied room of guest concierge apps in 2026.',
  description:
    'Duve, Canary, and the rest of the digital concierge SaaS catalog all price per occupied room — a model that punishes boutiques in their best months. Here is what those bills actually look like at boutique scale, and the per-property alternative.',
  publishedAt: '2026-06-26',
  readingMinutes: 8,
  topic: 'Benchmarks',
  heroImage: '/AdobeStock_327436679.jpeg',
  heroAlt: 'Hotel reception desk with brass service bell',
}

export default function Post() {
  return (
    <>
      <p>
        Of all the back-office subscriptions a boutique hotel
        carries, the guest concierge app is the one most
        operators have the least clear picture of the cost of —
        in part because the pricing model is built to obscure it.
        Every major vendor in the category prices per occupied
        room per month, which sounds reasonable until you do
        the multiplication and realize you are paying the most
        in the months you are doing the best.
      </p>
      <p>
        This is the cost breakdown we wish operators saw before
        they signed a contract. Real numbers, real screen
        counts, real implications.
      </p>

      <h2>The vendors and their pricing</h2>
      <p>
        Three names show up in almost every boutique conversation
        about digital concierge: Duve, Canary, and Hudini. The
        published pricing as of 2026 lands roughly in these
        ranges:
      </p>
      <ul>
        <li>
          <strong>Duve.</strong> Entry tier starts around $3 per
          occupied room per month; mid-tier with custom branding
          and upsell modules lands around $5–$6 per occupied
          room. Larger groups negotiate flat-rate but the
          published model for independents is per-occupied-room.
        </li>
        <li>
          <strong>Canary.</strong> Pricing varies by module set
          (digital check-in vs upsells vs ID verification) but
          per-occupied-room ranges from $3 to $7 per occupied
          room depending on which modules are turned on.
        </li>
        <li>
          <strong>Hudini.</strong> Headline price around $5 per
          occupied room per month for the standard package,
          tiered upward for the kiosk hardware bundle.
        </li>
      </ul>
      <p>
        For the rest of this analysis we will use a midpoint of
        $4 per occupied room per month, which is a reasonable
        representative number for an independent boutique
        evaluating a standard package. The arithmetic scales
        linearly if your actual rate is higher or lower.
      </p>

      <h2>What that costs at boutique scale</h2>
      <p>
        The number that matters is not the per-room rate. It is
        the monthly bill. Run the math at the occupancy and room
        counts boutiques actually operate at:
      </p>
      <ul>
        <li>
          <strong>20-room property at 60% occupancy:</strong> 20 × 30 × 0.60 ×
          $4 = $1,440/year, or $120/month average.
        </li>
        <li>
          <strong>40-room property at 70% occupancy:</strong> 40 × 30 × 0.70 ×
          $4 = $3,360/year, or $280/month average.
        </li>
        <li>
          <strong>60-room property at 75% occupancy:</strong> 60 × 30 × 0.75 ×
          $4 = $5,400/year, or $450/month average.
        </li>
        <li>
          <strong>40-room property at 90% occupancy (summer peak):</strong>{' '}
          40 × 30 × 0.90 × $4 = $360/month for that month alone.
        </li>
      </ul>
      <p>
        Three observations fall out of this. First, the bill is
        bigger than most operators remember it being — because
        the contract was signed during a lower-occupancy season
        and the cost grew silently with success. Second, the
        per-room model penalizes the operator for being busy:
        the months you are most stretched are the months the
        software costs the most. Third, the bill scales linearly
        with occupancy but the value the software delivers does
        not — a property at 90% occupancy is not getting twice
        the operational benefit per guest that the same property
        gets at 45% occupancy.
      </p>

      <h2>Why the per-occupied-room model exists</h2>
      <p>
        Per-occupied-room pricing is a story the vendor tells
        themselves, not the operator. From the vendor’s
        perspective, it aligns their revenue with the property’s
        revenue — when you do well, they do well. From the
        operator’s perspective, it transfers risk in exactly the
        wrong direction: in your worst months, the software is
        still expensive on a per-room-night basis (because the
        absolute room count is what is small, not the percentage),
        and in your best months you are paying for capability you
        already had at low occupancy.
      </p>
      <p>
        The honest defense of the model is that vendors built
        it for chains, where a property is one of many and the
        aggregate revenue smooths out. The dishonest defense is
        that it “scales with you” — what it actually does is
        scale your bill with you, which is a different thing.
      </p>

      <h2>Hidden line items</h2>
      <p>
        The headline per-occupied-room number rarely captures
        the whole bill. The line items that bite boutiques:
      </p>
      <p>
        <strong>Setup fees.</strong> Most concierge SaaS vendors
        charge a one-time setup fee in the $500–$2,000 range to
        configure the property’s branding, room types, and
        integrations. For a 40-room property paying $280/month
        ongoing, that is up to seven months of recurring cost in
        a single line item.
      </p>
      <p>
        <strong>Per-module pricing.</strong> The headline number
        often covers the basic guest portal. Upsells, ID
        verification, digital check-in, kiosk integration, the
        “smart upsell” add-on — each is priced separately, and
        the salesperson’s pitch usually assumes you will turn
        them all on.
      </p>
      <p>
        <strong>Integration fees.</strong> If you want the
        concierge tool to read room status from your PMS, there
        is often a one-time integration fee and sometimes a
        recurring per-property API charge.
      </p>
      <p>
        <strong>Hardware.</strong> Kiosk-style check-in adds
        proprietary hardware costs — $500–$1,500 per kiosk,
        sometimes leased back to the property on a multi-year
        contract.
      </p>
      <p>
        Run those line items through a realistic operator
        budget and the “digital concierge” line — once you add
        setup, modules, integration, and hardware — is often
        running 25–40% above the headline per-room price.
      </p>

      <h2>What does the operator actually need?</h2>
      <p>
        Step back from the vendor catalog and look at the
        operational job. A boutique guest concierge tool is
        delivering, at most, five things:
      </p>
      <ul>
        <li>A branded arrival page the guest opens before check-in.</li>
        <li>Wi-Fi credentials and room information in one place.</li>
        <li>Restaurant menus, room service, spa, gym hours.</li>
        <li>A neighborhood guide.</li>
        <li>An optional path to a printed QR card in each room.</li>
      </ul>
      <p>
        Every one of these is achievable by a per-property tool
        without the per-occupied-room axis. The arrival page
        does not get more valuable when the property is full; it
        does not deliver less value when the property is empty.
        The cost should not move with occupancy.
      </p>

      <h2>The per-property alternative</h2>
      <p>
        A flat per-property concierge price changes the
        operator’s relationship with the feature. At, say,
        $39/property/month flat for unlimited rooms and unlimited
        guests, a 40-room property at any occupancy pays the
        same — and the bill is dramatically lower than the
        per-occupied-room model in any realistic operating
        scenario. The 40-room property at 70% occupancy goes
        from $280/month on Duve-midpoint pricing to $39/month
        flat. That is roughly $2,900/year of savings on this
        line item alone, before counting setup fees and
        integrations the per-property model usually does not
        charge for.
      </p>
      <p>
        The other effect is that the operator stops thinking
        about the concierge surface as a budget item. They can
        turn it on for every room. They can add a per-property
        neighborhood guide without worrying about the cost. They
        can rotate menu items weekly without re-evaluating the
        ROI. The tool becomes a normal operational surface
        rather than a contract line item.
      </p>

      <h2>What to ask any guest concierge vendor in 2026</h2>
      <ul>
        <li>
          <strong>How does the price scale with occupancy?</strong> If
          the answer involves multiplying by occupied rooms, ask
          for a per-property quote. Most vendors will refuse;
          the ones that offer it are worth a second look.
        </li>
        <li>
          <strong>What is the setup fee, and is it negotiable?</strong>{' '}
          For an independent boutique, setup fees over $500 are
          almost always negotiable down to zero — vendors prefer
          a clean ongoing relationship over a one-time
          recoupment.
        </li>
        <li>
          <strong>What modules are included in the headline
          price?</strong> If the salesperson’s demo touched
          three features that turn out to be separate add-ons,
          your real bill is meaningfully higher than the quote.
        </li>
        <li>
          <strong>What hardware do I need?</strong> Anything that
          requires a proprietary kiosk or a particular tablet
          model is a multi-year lock-in disguised as a feature.
        </li>
      </ul>

      <p className="text-sm text-subtle">
        For the analogous breakdown on the signage side of the
        budget, see{' '}
        <Link href="/blog/hotel-digital-signage-cost-2026">
          how much boutique hotels actually pay for digital
          signage
        </Link>
        . For the broader operating-budget context that frames
        why these per-axis pricing models matter so much at
        boutique scale, read{' '}
        <Link href="/blog/boutique-hotel-operations-budget">
          what the boutique hotel operations budget actually
          looks like
        </Link>
        .
      </p>
    </>
  )
}
