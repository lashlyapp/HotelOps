import type { Metadata } from 'next'
import {
  LpPage,
  lpRootMetadata,
  type LpContent,
} from '@/components/marketing/lp-layout'

const content: LpContent = {
  slug: 'signage',
  metaTitle: 'Hotel digital signage software — every TV, one flat price | MyHotelOps',
  metaDescription:
    'Run digital signage on every browser-capable TV in your hotel. Schedule by day, hour, or zone. Emergency broadcast in one click. Flat per-property pricing instead of per-screen — no surprise bills as you add lobbies, restaurants, and meeting rooms.',
  eyebrow: 'Digital signage',
  heroHeadline: 'Every TV in your hotel, run from one browser.',
  heroSub:
    'Any browser-capable TV becomes a managed screen. Schedule content by day, hour, or zone. Take over every screen in an emergency with one click. Three screens included in the base plan; unlimited via the Signage Unlimited add-on — never per-screen, never per-room.',
  heroImage: '/AdobeStock_131189921.jpeg',
  heroAlt: 'Modern guest room with a wall-mounted TV',
  problemBullets: [
    'A signage vendor that charges per screen, so the lobby TV is managed and the meeting-room TVs aren’t.',
    'A USB stick someone updates every Monday, that nobody updates when Monday is a holiday.',
    'A meeting room TV stuck on the wrong slideshow because the previous event organizer “fixed it” with the remote.',
    'No way to push an emergency message to every screen at once when it actually matters.',
  ],
  outcomeBullets: [
    {
      title: 'Every screen, one dashboard.',
      body: 'Any TV with a browser becomes a managed display. Lobbies, restaurants, meeting rooms, back-of-house, gym — same login, same workflow, same content library. No per-screen license tax.',
    },
    {
      title: 'Scheduling by day, hour, or zone.',
      body: 'Lobby screen runs the welcome loop until 10 PM, then switches to the night-mode slideshow. Restaurant TVs run brunch content Saturday and Sunday morning. Schedules are calendar-aware and stop being “someone has to remember to change it.”',
    },
    {
      title: 'Emergency broadcast in one click.',
      body: 'Pre-built templates for fire, weather, evacuation. One click takes over every screen at a property with the right message in the right language. Pre-tested so the moment you actually need it isn’t the moment you’re reading documentation.',
    },
    {
      title: 'Content lives where your media already does.',
      body: 'Pull straight from the property’s media library (photos, videos, branded text cards) instead of maintaining a parallel signage CMS. Update the menu in one place; it reflects on the lobby screen, the in-room TV, and the arrival page.',
    },
  ],
  steps: [
    {
      n: '01',
      title: 'Point the TV browser at a URL.',
      body: 'Each screen gets a unique URL. Open it in any browser-capable TV (most modern smart TVs, Chromecast, Apple TV with a browser app, Raspberry Pi). The screen pairs to your account and starts displaying content immediately.',
    },
    {
      n: '02',
      title: 'Build playlists in-app.',
      body: 'Combine photos, videos, and branded text cards into playlists. Assign a playlist to a screen or a zone. Schedule by time of day, day of week, or specific date range.',
    },
    {
      n: '03',
      title: 'Push updates in real time.',
      body: 'Edits to the playlist reflect on the screens within seconds — no need to physically visit any TV. Emergency override available for fire, weather, and custom situations.',
    },
  ],
  faq: [
    {
      q: 'What TVs work with this?',
      a: 'Anything with a modern web browser. Samsung Tizen, LG webOS, Chromecast with Google TV, Apple TV (with a browser app), Amazon Fire TV, or a Raspberry Pi behind any HDMI display. We can’t support TVs from before about 2016 that don’t have a browser at all.',
    },
    {
      q: 'How is this priced?',
      a: 'Three screens per property are included in the $100/property/month base. Beyond that, turn on the Signage Unlimited add-on for one flat monthly fee per property — every additional screen is included. Never per-screen, never per-room.',
    },
    {
      q: 'Does it handle emergency broadcast?',
      a: 'Yes. One click takes over every screen at a property with pre-built fire, weather, and evacuation templates, or with a custom message. Pre-tested so you’re not learning the UI during an actual emergency.',
    },
    {
      q: 'Can I manage multiple properties from one login?',
      a: 'Yes. The multi-property console rolls up signage across every property your account controls. Switch context in one click; same workflows for each property.',
    },
    {
      q: 'What about content — do I need a designer?',
      a: 'No. Build branded text cards in-app using your hotel’s color palette and typography (set once, applied everywhere). Pull photos and videos from your existing media library. Most properties never touch Canva or PowerPoint for signage again.',
    },
  ],
  featuresAnchor: '#guest-facing',
}

export const metadata: Metadata = lpRootMetadata(content)

export default function Page() {
  return <LpPage content={content} />
}
