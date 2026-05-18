import Link from 'next/link'
import type { BlogPostModule } from '../types'

export const meta: BlogPostModule['meta'] = {
  slug: 'hotel-signage-content-that-does-not-look-2008',
  title:
    'Hotel signage content that doesn’t look like 2008.',
  description:
    'Most boutique digital signage is technically modern but visually stuck a decade in the past — Comic Sans event posters, rainbow gradient borders, and Word-document menus. Here is what content actually belongs on a hotel screen in 2026, and the small design rules that fix the rest.',
  publishedAt: '2026-10-16',
  readingMinutes: 6,
  topic: 'Guest experience',
  heroImage:
    'https://images.unsplash.com/photo-1771036566076-410776650fb2?w=1200&q=80&auto=format&fit=crop',
  heroAlt: 'Clean wayfinding sign on a tiled wall',
}

export default function Post() {
  return (
    <>
      <p>
        The screens are new; the content is what was on the
        printed bulletin board in 2008. Rainbow gradient borders.
        Word-document menus with mismatched fonts. Event posters
        in Comic Sans. The hardware refresh landed at most
        boutiques in the last few years — the content didn’t, and
        guests register the inconsistency.
      </p>
      <p>
        The rules below close the gap. None require expensive
        design software or a hired agency. Most are a single
        afternoon of work.
      </p>

      <h2>The fundamental rule: one font, one palette</h2>
      <p>
        The single biggest distinguishing feature between
        chain-grade and amateur signage is consistency. The
        chain hotel’s lobby board uses one font, the brand
        palette, and consistent margins. The amateur board
        uses whatever font the staff member who built it
        liked, with WordArt-style effects, and centered text
        for no apparent reason.
      </p>
      <p>
        Pick one typeface. The hotel’s own brand typeface if
        you have one; if not, one of the system sans-serifs
        (Inter, SF Pro, or Helvetica). Use it everywhere. Pick
        one palette — three colors at most, drawn from the
        hotel’s brand. Use that palette everywhere. Every piece
        of content that goes on a screen is built from those
        two constraints.
      </p>
      <p>
        The discipline of the constraints is what makes the
        result look professional. Without the constraints,
        every staff member who builds a slide will make
        different choices, and the cumulative effect is a
        property that looks like seven different hands worked
        on the design.
      </p>

      <h2>The content rule: information density per screen</h2>
      <p>
        A digital sign in a hotel is not a poster. Guests are
        not stopping to study it; they are glancing as they
        walk past. The right information density is roughly
        the same as a billboard: one thing per screen, large
        enough to read from 6 feet away, simple enough to
        absorb in two seconds.
      </p>
      <p>
        What this means in practice:
      </p>
      <ul>
        <li>
          A welcome message is one screen. The guest’s name
          (if it is a personalized welcome), nothing else.
        </li>
        <li>
          An event is one screen. The event name, the date
          and time, the room. Maybe the host. Nothing else.
        </li>
        <li>
          A weather and time block is one screen. The
          current temperature, the forecast, the local time.
          Maybe sunrise/sunset. Nothing else.
        </li>
        <li>
          A property amenity callout is one screen. The
          amenity, the hours, the location. Nothing else.
        </li>
      </ul>
      <p>
        Properties rotate through these screens at a pace of
        roughly one screen every 6–8 seconds. The guest sees
        2–3 screens as they walk through the lobby; they
        absorb each one because each one was built to be
        absorbed.
      </p>

      <h2>What does not belong on a screen</h2>
      <p>
        The categories of content that consistently look bad
        on hotel signage and should not be there:
      </p>
      <p>
        <strong>Long lists.</strong> A 12-line menu does not
        belong on a digital screen. The arrival page or a
        printed menu is the right surface for that
        information. A screen with a 12-line menu reads as
        scrolling-text-from-1998 even if the design is fine.
      </p>
      <p>
        <strong>Stock photos with no purpose.</strong> Generic
        lifestyle photos from a stock library reduce the
        property’s perceived authenticity. If a slide does
        not benefit from an image, do not put an image on it.
        White space is a feature.
      </p>
      <p>
        <strong>Vendor logos.</strong> Whoever built the
        signage may have wanted their logo in the corner. If
        you can turn it off, turn it off. The screen
        represents the hotel, not the SaaS that displays it.
      </p>
      <p>
        <strong>Last week’s event.</strong> The most common
        signage failure is a screen that is technically
        working but advertising something that already
        happened. Schedule events to come down automatically
        the moment they end; do not rely on a staff member to
        remember.
      </p>
      <p>
        <strong>Auto-playing video with sound.</strong>
        Hospitality common spaces should be quiet. Video with
        sound is intrusive at best, and pointless at worst
        (the guests are walking past).
      </p>

      <h2>The five screens every boutique should run</h2>
      <p>
        For a single-property boutique with one to three
        screens in common spaces, the content rotation that
        consistently works:
      </p>
      <ol>
        <li>
          <strong>Welcome / time.</strong> The hotel wordmark,
          the local time, a brief seasonal greeting. The
          default state of the screen when nothing else is
          scheduled.
        </li>
        <li>
          <strong>Today’s dining service.</strong> What is
          serving right now (breakfast, lunch, dinner, late
          bar) and where. Updates automatically based on
          the time of day.
        </li>
        <li>
          <strong>Today’s events.</strong> The wedding in the
          ballroom, the corporate offsite in the conference
          room, the spa schedule. Quietly rotated off the
          moment the event begins (it is not advertising
          anymore; it is signaling).
        </li>
        <li>
          <strong>Property highlights.</strong> One amenity
          per slide. The rooftop bar, the spa hours, the
          guided neighborhood walks. Rotates through your
          signature offerings.
        </li>
        <li>
          <strong>Emergency.</strong> Built but never visible
          in normal operation. The pre-built template that
          takes over every screen in one click when needed.
          For more on the safety side, see{' '}
          <Link href="/blog/boutique-hotel-emergency-communications-plan">
            the boutique emergency communications plan
          </Link>
          .
        </li>
      </ol>

      <h2>Who builds and who maintains</h2>
      <p>
        The work of building the initial five-screen rotation
        is a single afternoon for a staff member with basic
        design taste — or two afternoons if the property is
        starting from a blank brand book and needs to pick
        the typeface and palette first.
      </p>
      <p>
        The maintenance work is small but recurring. Once a
        week, the GM (or the front desk supervisor) updates:
      </p>
      <ul>
        <li>This week’s events on the events slide.</li>
        <li>Any amenity hour change on the dining slide.</li>
        <li>Anything new or seasonal on the property highlights.</li>
      </ul>
      <p>
        Once a month, the GM walks past every screen for a
        full minute each, checking that nothing has frozen,
        nothing is showing a stale event, the brand is
        consistent across screens. This walk is part of the
        broader monthly tech walk — see{' '}
        <Link href="/blog/10-ways-to-modernize-your-boutique-hotel#step-10">
          step 10 of the modernization guide
        </Link>
        .
      </p>

      <h2>The structural side</h2>
      <p>
        None of the content rules above matter if the
        technical side of the signage is making the workflow
        painful. The screens should be on a browser-based
        signage system any TV can pair with — not a USB stick
        someone has to swap, not a Chromecast someone has to
        reconnect every month. The pricing should be
        per-property, not per-screen, so adding the meeting
        room screen does not require a separate budget
        decision. For the cost benchmark, see{' '}
        <Link href="/blog/hotel-digital-signage-cost-2026">
          how much boutique hotels actually pay for digital
          signage in 2026
        </Link>
        .
      </p>
      <p>
        Once the structural side is right, the content side is
        a design discipline rather than an engineering
        problem. One typeface, one palette, one thing per
        screen, no stale content. The lobby board stops being
        the part of the property that visibly belongs to 2008
        and starts being one of the small surfaces that
        compounds into the impression of a well-run hotel.
      </p>
    </>
  )
}
