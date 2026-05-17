import type { Metadata } from 'next'
import {
  LpPage,
  lpRootMetadata,
  type LpContent,
} from '@/components/marketing/lp-layout'

const content: LpContent = {
  slug: 'arrival',
  metaTitle: 'Hotel QR arrival page — replace the laminated room card | MyHotelOps',
  metaDescription:
    'A per-room QR code that opens to your hotel’s brand on the guest’s phone: current Wi-Fi, dining hours, room-service menus, neighborhood guide. No app install, no account, no friction. Editable in five minutes. 7-day free trial.',
  eyebrow: 'Guest arrival',
  heroHeadline: 'Replace the laminated welcome card with something guests actually use.',
  heroSub:
    'A per-room QR code opens a fast-loading, branded arrival page on the guest’s phone — current Wi-Fi password, current restaurant hours, room-service menu with photos, neighborhood guide. No app install, no account, no login. Editable from a phone in five minutes when something changes.',
  heroImage: '/AdobeStock_94588323.jpeg',
  heroAlt: 'Hotel manager with a tablet, warm interior lobby',
  problemBullets: [
    'A laminated welcome card printed in 2019 with a Wi-Fi password that hasn’t been right since 2022.',
    'A breakfast hours line that says “7–10 AM” but the kitchen actually closes at 9:30 on Sundays.',
    'A “please call the front desk” line that guests interpret as “please leave a one-star review about the front desk.”',
    'No way to update any of it without a print shop and a Tuesday afternoon.',
  ],
  outcomeBullets: [
    {
      title: 'Wi-Fi password one tap to copy.',
      body: 'Guests scan the QR with their phone’s camera, the page opens with one prominent button to copy the current Wi-Fi password. No typing, no transcription errors, no calling the front desk.',
    },
    {
      title: 'Hours that are actually current.',
      body: 'Dining hours, spa hours, gym hours, pool hours — edited in the dashboard in seconds, reflected on every guest’s arrival page within seconds. The Sunday brunch hours are right because someone updated them on Friday, not because the card hasn’t been reprinted yet.',
    },
    {
      title: 'Room-service menu with photos.',
      body: 'Pull menus from your media library, complete with item photos. Guests browse on the surface they’re already holding — their phone. Orders go to the front desk or to your room-service workflow.',
    },
    {
      title: 'Brand reads as “current,” not “1990s hotel.”',
      body: 'The arrival page uses your hotel’s actual brand — colors, typography, photography. A guest who has to scan a QR to find dining info has just registered your property as the kind of place where small details get attention. That impression encodes directly into the next review.',
    },
  ],
  steps: [
    {
      n: '01',
      title: 'Print a QR per room.',
      body: 'Each room gets a unique QR card. Designed to match your brand; printed alongside the room key cards. A few cents per room. Replaces the laminated card; sits in the same spot.',
    },
    {
      n: '02',
      title: 'Guest scans on arrival.',
      body: 'Camera app, single scan, page loads in under a second. Wi-Fi credentials, hours, menus, brand. No friction — no app store, no account creation, no email capture.',
    },
    {
      n: '03',
      title: 'GM edits anything from a phone.',
      body: 'Wi-Fi changed? Hours changed? Menu updated? Edit once in the dashboard; every guest in every room sees the new version instantly. No reprint cycle, no laminator.',
    },
  ],
  faq: [
    {
      q: 'Do guests need to install an app?',
      a: 'No. The arrival page is a regular web page that opens in the guest’s phone browser the moment they scan the QR. No app store, no account, no email capture, no login.',
    },
    {
      q: 'Is it available in multiple languages?',
      a: 'Yes. The arrival page can serve content in your guests’ language — useful at international properties or in markets like Lisbon, Mexico City, or Tokyo where guests arrive speaking many different languages. Six locales supported out of the box (EN, ES, FR, JA, KO, VI), with more on request.',
    },
    {
      q: 'Can guests use it to report problems?',
      a: 'Yes — that’s part of the Guest Experience add-on. Guests scan a QR and report problems in their language. Tickets land in the same Kanban board as staff-reported work orders, so a leaking faucet at 11 PM doesn’t get lost in translation.',
    },
    {
      q: 'How much does it cost?',
      a: 'The basic arrival page is part of the $100/property/month base. The Guest Experience add-on extends it with multi-language guest issue intake and in-room QR menus — turn it on from /billing when you want it; billed prorated.',
    },
    {
      q: 'Can we A/B test the page?',
      a: 'Not in v1. The page reflects whatever you publish, and edits go live immediately. We’re tracking interest in built-in A/B testing for a future release — let us know if it matters to you.',
    },
  ],
  featuresAnchor: '#guest-facing',
}

export const metadata: Metadata = lpRootMetadata(content)

export default function Page() {
  return <LpPage content={content} />
}
