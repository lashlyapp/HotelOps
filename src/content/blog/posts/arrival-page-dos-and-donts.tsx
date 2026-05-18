import Link from 'next/link'
import type { BlogPostModule } from '../types'

export const meta: BlogPostModule['meta'] = {
  slug: 'hotel-arrival-page-design-dos-and-donts',
  title:
    'The Hotel Arrival Page: 5 Do’s and 5 Don’ts.',
  description:
    'The branded arrival page is one of the few digital surfaces every guest interacts with directly. Most boutique properties build theirs once and never revisit. Here is what to do, what to never do, and what to actually put on the page.',
  publishedAt: '2026-10-02',
  readingMinutes: 6,
  topic: 'Guest experience',
  heroImage:
    'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=1200&q=80&auto=format&fit=crop',
  heroAlt: 'Modern hotel bed with throw pillows ready for the guest',
}

export default function Post() {
  return (
    <>
      <p>
        The QR arrival page is one of the cheapest pieces of
        digital infrastructure a boutique hotel runs and one of
        the most disproportionately impression-shaping. A guest
        scans the QR card in their room within minutes of
        arrival, and what loads on their phone in the next two
        seconds shapes their picture of the entire property —
        often more than the lobby they just walked through.
      </p>
      <p>
        Most boutique arrival pages are built once, never
        revisited, and quietly drift out of date over the next
        18 months. Here is the small set of design and content
        rules that keep the page actively earning its keep, and
        the common mistakes that quietly undo the work.
      </p>

      <h2>Do: open to the hotel’s palette</h2>
      <p>
        The first half-second of the page load decides whether
        the guest registers the property as “put together” or
        “generic.” The page that opens to the hotel’s actual
        brand colors, with the wordmark in the right place, in
        the right typeface, reads as deliberate. The page that
        opens to a template-vendor’s default skin reads as
        outsourced.
      </p>
      <p>
        This is the cheapest move on the list and the one most
        boutiques get wrong. The fix is one afternoon of design
        work, done once. The compounding payoff lasts as long
        as the page does.
      </p>

      <h2>Do: put the Wi-Fi password one tap away</h2>
      <p>
        Wi-Fi is the single highest-utility information on the
        arrival page. The page should show the network name and
        password above the fold, with a one-tap “copy password”
        button. The guest is connecting to the Wi-Fi in the
        next 60 seconds; everything else can wait.
      </p>
      <p>
        For the structural side of how the Wi-Fi gets set up in
        the first place, see{' '}
        <Link href="/blog/hotel-guest-wifi-setup-2026">
          hotel guest Wi-Fi, the right way in 2026
        </Link>
        .
      </p>

      <h2>Do: show dining hours that reflect today</h2>
      <p>
        The restaurant hours on the arrival page should be the
        actual hours for this day of the week, not a generic
        “Mon–Sun 7am–10pm” range. If the kitchen closes at 9
        on Tuesdays, the page should show 9 on Tuesdays. The
        difference matters less for accuracy and more for what
        it signals: this is a property that updates its own
        information.
      </p>
      <p>
        The mechanism is simple: the dining hours live in the
        same source of truth as the menus, and the page reads
        from it. Updating once updates everywhere.
      </p>

      <h2>Do: include a short neighborhood guide</h2>
      <p>
        The neighborhood guide is the highest-leverage section
        of the page for differentiating a boutique from a
        chain. Five to seven places — restaurants, coffee, one
        cultural thing, one walk — with the property’s
        recommendation in one sentence each. Specific. Not
        “a great cafe nearby”; “Padaria de Belém, 8 minutes
        on foot, the pastéis de nata that you actually came
        for.”
      </p>
      <p>
        The guide should be reviewed quarterly. Restaurants
        close. Coffee shops change owners. A neighborhood guide
        that recommends a restaurant that has been closed for
        eight months is one of the more damaging cues a
        guest can encounter on this page; it advertises that
        nobody has looked at the page since 2022.
      </p>

      <h2>Do: keep it readable on the phone they were already holding</h2>
      <p>
        Every design decision on the arrival page should
        assume the guest is reading it on a phone they were
        already using. This means:
      </p>
      <ul>
        <li>
          Text size large enough to read without zooming.
          Roughly 16px minimum body text.
        </li>
        <li>
          Adequate contrast — black on white or near-black on
          near-white, not light gray on white.
        </li>
        <li>
          Tap targets large enough to hit without precision.
          44px minimum on phone scale.
        </li>
        <li>
          No carousels that auto-advance. The guest is
          scanning, not waiting.
        </li>
      </ul>

      <h2>Don’t: gate it behind an account</h2>
      <p>
        The single most common arrival-page mistake is asking
        the guest to log in or create an account before
        showing them the Wi-Fi password. This converts at
        roughly zero percent and signals “we care about
        capturing your data more than serving you.” The
        information on the arrival page is not sensitive; no
        login should be required.
      </p>
      <p>
        If you absolutely need to collect something from the
        guest during their stay, ask after they have already
        gotten value from the page — never before.
      </p>

      <h2>Don’t: embed a third-party widget you cannot brand</h2>
      <p>
        Almost every boutique we have seen has at some point
        embedded a third-party booking widget, a weather
        widget, or a “concierge chat” widget on the arrival
        page. Two of those almost always read as generic; the
        third (weather) is information the phone already has.
      </p>
      <p>
        The rule of thumb: every visible element on the page
        should belong to the brand. If it does not, it is
        making the page feel less like the hotel’s and more
        like a template. The hotel did not pay for the lobby
        floor so it could put a vendor’s logo on it.
      </p>

      <h2>Don’t: bury the page behind a captive portal</h2>
      <p>
        Some properties try to gate the arrival page behind
        the same captive portal that gates the Wi-Fi. The
        effect is that the guest cannot read the page until
        they have already connected to the Wi-Fi, which they
        cannot do until they have read the page. This loops
        every guest for the first 90 seconds of the stay and
        is one of the more avoidable self-inflicted wounds in
        the catalog. The arrival page lives on the open
        internet; the Wi-Fi connects on the first tap.
      </p>

      <h2>Don’t: scatter the source of truth</h2>
      <p>
        The arrival page should read from the same source of
        truth that powers the rest of the property’s
        information surface. The Wi-Fi password on the page
        should be the same one in the IT hub. The dining hours
        on the page should be the same ones on the lobby
        screen. The menu items on the page should be the same
        ones on the printable in-room card.
      </p>
      <p>
        When the source of truth is scattered — when the page
        is edited in one tool, the IT hub in another, the
        signage in a third — the property’s information
        surface drifts apart over months. A guest who reads
        9pm dinner service on the arrival page and arrives at
        the restaurant at 8:55 to find it closed has had a
        worse experience than if you had never put the hours
        on the page in the first place.
      </p>

      <h2>Don’t: forget to update it</h2>
      <p>
        The cheapest digital decay in hospitality. The arrival
        page launched fresh, then nothing changed, and 12
        months later the “current promotions” are from last
        Easter. The page should be reviewed monthly — a 10
        minute walk-through with the GM, with anything stale
        being either updated or removed.
      </p>
      <p>
        Step 10 of the broader modernization guide — the
        monthly tech walk — is where this review belongs. See{' '}
        <Link href="/blog/10-ways-to-modernize-your-boutique-hotel#step-10">
          the field guide
        </Link>{' '}
        for the wider walk.
      </p>

      <h2>What to actually put on the page</h2>
      <p>
        Pulling the do’s and don’ts together, a strong boutique
        arrival page in 2026 has, in roughly this order:
      </p>
      <ol>
        <li>Hotel wordmark and a short welcome line.</li>
        <li>Wi-Fi name and password with a one-tap copy.</li>
        <li>Today’s dining hours (breakfast, restaurant, bar).</li>
        <li>Room service menu with photos and prices.</li>
        <li>Amenity hours (spa, gym, pool).</li>
        <li>The short neighborhood guide.</li>
        <li>A single contact path (text or call the front desk).</li>
        <li>A printable in-room card link, generated from the same content.</li>
      </ol>
      <p>
        Eight blocks. Nothing else. The temptation to add a
        loyalty signup, a survey, an upsell widget, a social
        feed — resist it. The arrival page does one job
        exceptionally well, and that job is to make the first
        ten minutes of the stay frictionless. Every additional
        element competes with that job.
      </p>
    </>
  )
}
