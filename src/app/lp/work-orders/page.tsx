import type { Metadata } from 'next'
import {
  LpPage,
  lpRootMetadata,
  type LpContent,
} from '@/components/marketing/lp-layout'

const content: LpContent = {
  slug: 'work-orders',
  metaTitle: 'Hotel work order software — photo-first maintenance tickets | MyHotelOps',
  metaDescription:
    'Replace paper logbooks and WhatsApp threads with a photo-first maintenance ticket system built for boutique hotels. Time-stamped audit log, Kanban board, mobile-first. 7-day free trial, no credit card.',
  eyebrow: 'Maintenance & work orders',
  heroHeadline: 'The maintenance system your boutique hotel actually deserves.',
  heroSub:
    'Every ticket starts with a photo and a room number, ends with an after-photo, and lives on a Kanban board the GM can scan at a glance. Built for boutique properties — no per-seat fees, no PMS integration headaches, no enterprise onboarding.',
  heroImage: '/AdobeStock_327436679.jpeg',
  heroAlt: 'Reception desk with a brass service bell, indicating front-of-house operations',
  problemBullets: [
    'A paper logbook at the front desk that no one updates after 9 PM.',
    'A WhatsApp thread with twelve people in it where “bathroom 312” gets lost between baby photos.',
    'A GM spending 4–6 hours a week re-asking, re-tagging, and re-chasing tickets that have been sitting in someone’s phone.',
    'No way to prove to the owner that the cycle from guest report to resolved fix is actually getting shorter.',
  ],
  outcomeBullets: [
    {
      title: 'Median maintenance cycle drops from days to hours.',
      body: 'Photo-first tickets close the gap between “the bathtub is chipped” and “fix this specific bathtub by 3 PM.” Most properties see median time-to-resolution fall from 2–3 days on paper to under 4 hours on the board.',
    },
    {
      title: 'Every fix has visual evidence.',
      body: 'Before-photo on intake, after-photo on close, time-stamped on both ends. The audit log is something the owner can scan at the end of the month without re-interviewing the engineer.',
    },
    {
      title: 'GMs get 4–6 hours a week back.',
      body: 'No more chasing tickets across phones, no more re-asking “did you fix 312 yet”, no more end-of-day reconciliation. The board is the source of truth and it’s open on everyone’s phone.',
    },
    {
      title: 'Front desk and engineering finally share one tool.',
      body: 'Front desk takes the photo on intake. Engineering sees it on a phone within minutes. Ownership gets a roll-up across properties. One workflow, one source of truth, three role-gated views.',
    },
  ],
  steps: [
    {
      n: '01',
      title: 'Open a ticket with a photo.',
      body: 'Front desk or housekeeping snaps a photo, tags a room number, picks a priority, and submits. Takes under 30 seconds.',
    },
    {
      n: '02',
      title: 'Engineering sees it instantly.',
      body: 'The ticket lands on a Kanban board on every authorized device. Status moves through New → In Progress → Done with a time-stamp on every transition.',
    },
    {
      n: '03',
      title: 'Close with proof.',
      body: 'The fix gets an after-photo on close. The audit log preserves the whole sequence — useful for owners, useful for insurance, useful for staff training.',
    },
  ],
  faq: [
    {
      q: 'Do I need to replace my PMS to use this?',
      a: 'No. MyHotelOps sits alongside your existing PMS (Mews, Cloudbeds, Opera, Little Hotelier, etc.). Your reservation system continues to own bookings, the folio, and the night audit. Maintenance lives here.',
    },
    {
      q: 'How much does it cost?',
      a: 'A flat $100 per property per month — no per-seat charge, no per-ticket charge, no per-screen charge. Includes maintenance work orders, events, IT hub, media library, three signage screens, and arrival pages. Full pricing on the /pricing page.',
    },
    {
      q: 'How long does it take to set up?',
      a: 'About fifteen minutes. Create an account, add your property, invite your team. The trial gives you the full feature set for 7 days; no credit card required to start.',
    },
    {
      q: 'Can housekeeping report problems without a login?',
      a: 'Yes — staff get individual logins (no per-seat fee), but you can also let guests report issues by scanning a QR code in their room. Their tickets land on the same Kanban board as staff-reported ones.',
    },
    {
      q: 'Is the data exportable if we leave?',
      a: 'Yes. Every ticket, every photo, every audit-log entry is exportable on request. No lock-in.',
    },
  ],
  featuresAnchor: '#operations',
}

export const metadata: Metadata = lpRootMetadata(content)

export default function Page() {
  return <LpPage content={content} />
}
