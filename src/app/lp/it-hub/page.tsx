import type { Metadata } from 'next'
import {
  LpPage,
  lpRootMetadata,
  type LpContent,
} from '@/components/marketing/lp-layout'

const content: LpContent = {
  slug: 'it-hub',
  metaTitle: 'Hotel IT documentation — Wi-Fi, vendor logins, equipment records | MyHotelOps',
  metaDescription:
    'One searchable, role-gated source of truth for Wi-Fi credentials, vendor logins, equipment serial numbers, warranty dates, and floor plans. Closes the “binder behind the front desk” risk. Built for boutique hotels. 7-day free trial.',
  eyebrow: 'IT Hub',
  heroHeadline: 'One searchable place for every credential, manual, and warranty.',
  heroSub:
    'Wi-Fi SSIDs and passwords, vendor portal logins, equipment serial numbers, warranty dates, floor plans, brand guidelines — all in one searchable, role-gated directory. Front desk sees what they need; ownership sees everything. When a staff member leaves, you close one account, not change six passwords.',
  heroImage: '/AdobeStock_327436679.jpeg',
  heroAlt: 'Reception desk — front-of-house operational nerve center',
  problemBullets: [
    'A binder behind the front desk from 2017 with the wrong Wi-Fi password and a phone number for a plumber who retired.',
    'A shared Google Doc nobody has the link to anymore, because the GM who created it left two years ago.',
    'A sticky note on the engineering manager’s monitor with the booking-engine login that everyone has memorized.',
    'A vendor portal password that gets shared in a group chat every time someone needs to change a setting at 11 PM.',
  ],
  outcomeBullets: [
    {
      title: 'Searchable from any device.',
      body: 'Type “fire panel” or “Wi-Fi guest network” or “Otis elevator” and find the exact credentials, warranty date, and last-called contact. Replaces 2 AM phone calls to the GM with a 2-second lookup on the on-shift manager’s phone.',
    },
    {
      title: 'Role-gated by default.',
      body: 'Front desk can see Wi-Fi credentials and dining info but not vendor portal logins. Engineering can see equipment, warranties, and vendor contacts but not ownership financial systems. Owners see everything. Permissions are the default state, not an afterthought.',
    },
    {
      title: 'Staff turnover stops being a knowledge crisis.',
      body: 'When the GM leaves, the institutional knowledge stays. The next GM inherits a complete record of vendor relationships, equipment history, and operational systems — not a phone full of contacts they hope they never lose.',
    },
    {
      title: 'Warranty and renewal dates don’t expire by accident.',
      body: 'Equipment warranty expiring next month? Brand asset license up for renewal? The dashboard surfaces upcoming expirations so they don’t turn into a “we should have caught that” postmortem.',
    },
  ],
  steps: [
    {
      n: '01',
      title: 'Pull everything into one place.',
      body: 'Start with what’s already documented: Wi-Fi credentials, the major vendor portals, the equipment serial numbers from your last insurance audit. Import is bulk-paste friendly — no slow data entry session.',
    },
    {
      n: '02',
      title: 'Tag and role-gate.',
      body: 'Mark which records are front-desk-visible, which are engineering-only, which are ownership-only. The defaults are conservative — front desk sees less than they probably need at first, which is the right side of that mistake.',
    },
    {
      n: '03',
      title: 'Search instead of asking.',
      body: 'When the on-shift manager needs the spa Wi-Fi password at 11 PM, they search the hub on their phone. Done. No text to the GM, no walking to the office.',
    },
  ],
  faq: [
    {
      q: 'Is this a password manager?',
      a: 'No, it’s not a password manager — it doesn’t auto-fill credentials in browsers and we recommend using a real password manager (1Password, Bitwarden) for personal credentials. IT Hub is for the operational records around your property: vendor logins, equipment serials, warranty dates, floor plans, brand assets. The kind of record that needs to outlive the GM who set it up.',
    },
    {
      q: 'How is access controlled?',
      a: 'Role-based, per-property. Three default roles (org_owner, org_staff, platform_admin), plus per-record visibility flags. Front desk sees the Wi-Fi entries marked “front-desk visible”; engineering sees the equipment records; owners see everything. Audit trail on every read of sensitive records.',
    },
    {
      q: 'What about secrets we don’t want to store in the hub at all?',
      a: 'Keep them out. IT Hub is opt-in per record. Sensitive financial credentials, signing keys, payment processor API keys, etc. should stay in a dedicated password manager. The hub is for the operational documentation layer that historically lived in a binder.',
    },
    {
      q: 'How much does it cost?',
      a: 'A flat $100 per property per month. IT Hub is part of the base subscription — alongside maintenance work orders, events, signage, arrival pages, and the media library. No per-record fee, no storage tier.',
    },
    {
      q: 'Can I export the records if I leave?',
      a: 'Yes. Every record is exportable on request. No lock-in.',
    },
  ],
  featuresAnchor: '#operations',
}

export const metadata: Metadata = lpRootMetadata(content)

export default function Page() {
  return <LpPage content={content} />
}
