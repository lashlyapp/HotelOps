import Link from 'next/link'
import type { BlogPostModule } from '../types'

export const meta: BlogPostModule['meta'] = {
  slug: 'hotel-guest-wifi-setup-2026',
  title:
    'Hotel guest Wi-Fi, set up the right way in 2026.',
  description:
    'Most boutique properties still run guest Wi-Fi the same way they did in 2014. Here is the modern setup — what to name the networks, how to handle the password, where the captive portal goes wrong, and how to put the credentials on a QR code guests can scan.',
  publishedAt: '2026-06-12',
  readingMinutes: 7,
  topic: 'Guest experience',
  heroImage: '/AdobeStock_131189921.jpeg',
  heroAlt: 'Modern hotel guest room with a phone on the desk',
}

export default function Post() {
  return (
    <>
      <p>
        The first thing every guest does when they walk into their
        room is take out their phone. The second thing is connect
        to the Wi-Fi. The experience of those two minutes shapes
        the rest of the stay, and at most boutique properties it
        is being delivered by a network configuration that has
        not been touched since 2014.
      </p>
      <p>
        The good news: every part of fixing this is cheap, and the
        lift in guest impression is disproportionate to the work.
        Here is the full modern setup, end to end, with the four
        decisions that matter and the four mistakes everyone makes.
      </p>

      <h2>Network names</h2>
      <p>
        Your property should have at most three Wi-Fi networks
        broadcasting in guest-facing spaces:
      </p>
      <ul>
        <li>
          <strong>Guest.</strong> The one your guests connect to.
          Name it after the hotel, not after the router model.
          “The Coastal Inn — Guest” is correct. “TPLink_5G_2A8F”
          is what you want to never see again.
        </li>
        <li>
          <strong>Staff.</strong> Internal staff devices and the
          property’s own hardware (signage screens, the PMS
          machine, the printer). Different password. Different
          VLAN if your hardware supports it.
        </li>
        <li>
          <strong>Events (optional).</strong> If you run weddings,
          corporate offsites, or anything that brings in a large
          number of devices for a few hours, a dedicated event
          SSID with its own bandwidth allocation keeps a 50-person
          AV team from saturating the guest network.
        </li>
      </ul>
      <p>
        Three networks total. Not five, not seven. The two most
        common mistakes are leaving the default vendor SSID
        broadcasting (it looks unprofessional and it tells
        intruders what hardware you run) and creating per-floor or
        per-room SSIDs (your access points already handle roaming
        between APs on the same SSID; multiple SSIDs make it
        worse, not better).
      </p>

      <h2>Passwords</h2>
      <p>
        The Wi-Fi password is the most-asked question at any
        boutique front desk, and almost every property gets it
        wrong in one of two ways: the password is so simple that
        it is effectively no password (“coastalinn” —
        congratulations, the people in the building across the
        street have been on your network for a year), or so
        complex that the front desk had to print it on a card
        because nobody can remember it.
      </p>
      <p>
        The right answer is a memorable-but-not-trivial password
        rotated annually. Something like <code>seabreeze2026</code>{' '}
        — three lowercase words plus the year. Easy to read aloud
        over the phone. Easy to put on a QR card. Hard to guess.
        When the year rolls over, you change one character, and
        the network is no longer the same network that has been
        leaking for a decade.
      </p>
      <p>
        The staff network gets a stronger password. Twelve
        characters minimum, no shared with anyone outside staff,
        rotated every time someone leaves the property. This is
        the network your PMS and your payment hardware sit on; do
        not treat it like the guest one.
      </p>

      <h2>Captive portals — usually wrong</h2>
      <p>
        Most boutique properties either run no captive portal at
        all (the Wi-Fi just works, which is what guests want) or
        run a captive portal so badly configured that it logs
        guests out every 90 minutes and forces them to re-accept
        terms they have already accepted. Both are bad in
        different directions.
      </p>
      <p>
        The default position should be: no captive portal for
        guests. The Wi-Fi connects on the first tap and stays
        connected for the duration of the stay. This is what
        Airbnb does, what every chain hotel does, and what every
        guest in 2026 expects.
      </p>
      <p>
        There are two reasons to run a captive portal, and
        neither applies to most boutiques:
      </p>
      <ul>
        <li>
          You are in a jurisdiction that requires Wi-Fi
          identification (Italy and a handful of others). In
          that case, the portal collects what the law requires
          and nothing more; it does not ask guests to enter
          credit card numbers or sign up for newsletters.
        </li>
        <li>
          You are running tiered guest Wi-Fi (free at one speed,
          premium at another). Almost no boutique should do
          this; the modern guest expectation is that decent
          Wi-Fi is included.
        </li>
      </ul>

      <h2>How guests should actually get the password</h2>
      <p>
        The laminated card on the desk is the most common
        delivery mechanism and the worst one. It does not get
        updated when the password rotates. It looks dated. The
        text is small enough that guests squint, give up, and
        call the front desk.
      </p>
      <p>
        Modern delivery is a QR code printed per room that
        opens a branded arrival page on the guest’s phone. The
        page shows the Wi-Fi name, the current password, and a
        “copy password” button. The guest is on the network
        before they have taken their coat off. The cost is a
        few cents of printed cardstock per room; the lift in
        impression is one of the most disproportionate
        operational moves a boutique can make.
      </p>
      <p>
        The other benefit is that updating the password
        becomes harmless. Rotate the password annually, update
        it in the arrival page once, and every QR card at the
        property is suddenly current. No printing, no
        re-laminating, no front-desk handoff. The piece of
        physical artifact in each room does not change; only
        the page it opens to does.
      </p>

      <h2>The four mistakes everyone makes</h2>
      <p>
        Across boutique properties we have walked, the same
        four mistakes recur, regardless of region:
      </p>
      <ul>
        <li>
          <strong>The password is on a sticky note behind the
          front desk.</strong> It is shared with every staff
          member who has ever worked at the property. The
          dishwasher who left on bad terms in March knows the
          password. Rotate it.
        </li>
        <li>
          <strong>The captive portal asks for an email.</strong>
          You are not building a marketing list this way; you
          are training guests to give you a junk email and to
          register the property as “tries too hard.” Drop it.
        </li>
        <li>
          <strong>The guest network has no client isolation.</strong>
          Every guest can see every other guest’s device on the
          network. This is a security risk and an easy fix on
          modern access points — a single checkbox.
        </li>
        <li>
          <strong>The hardware is too old for the room
          count.</strong> A single consumer access point in the
          lobby cannot cover a three-floor 40-room property.
          Symptoms are dropped connections, slow speeds in
          corner rooms, and guest complaints that get blamed on
          “the internet provider.” Most properties need 2–4
          access points distributed across the building. The
          hardware is not expensive; underinvesting in it is.
        </li>
      </ul>

      <h2>What to keep in your operational records</h2>
      <p>
        All of the above only stays current if there is a single
        source of truth that the staff can update. The Wi-Fi
        credentials, the captive portal status, the access point
        firmware version, the warranty dates on the routers,
        and the per-floor coverage map should live in one place
        — accessible to the staff who need them and not to the
        ones who do not.
      </p>
      <p>
        The wrong place to keep this is a binder behind the
        front desk. The right place is the same source-of-truth
        IT directory where your vendor logins, equipment
        warranties, and floor plans live.{' '}
        <Link href="/blog/10-ways-to-modernize-your-boutique-hotel#step-3">
          Step 3 of the modernization guide
        </Link>{' '}
        covers what that source of truth should look like.
      </p>
      <p>
        Wi-Fi is one of the few back-office surfaces where the
        right setup is genuinely cheap and the wrong setup is
        genuinely expensive. Most boutiques in 2026 are still on
        the wrong setup. An afternoon of work is enough to put
        the property on the right one — and once it is there, it
        stops being a recurring problem for the next several
        years.
      </p>
    </>
  )
}
