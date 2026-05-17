import type { Metadata } from 'next'
import {
  LpPage,
  lpRootMetadata,
  type LpContent,
} from '@/components/marketing/lp-layout'

const content: LpContent = {
  slug: 'events',
  metaTitle: 'Hotel events & catering software — proposal to invoice in one place | MyHotelOps',
  metaDescription:
    'Stop running events out of Word docs and email threads. Inquiry → proposal → invoice in one pipeline, branded PDFs in minutes, payment tracking built in. Made for boutique hotels and small groups. 7-day free trial.',
  eyebrow: 'Events & catering',
  heroHeadline: 'Catch every event inquiry. Send a branded proposal in minutes.',
  heroSub:
    'A single pipeline for inquiries, proposals, and invoices — branded PDFs, payment tracking, and a paper trail your bookkeeper can actually use. The boutiques that move on this typically recover 20–40% of inquiries they used to lose to slow-response competitors.',
  heroImage: '/AdobeStock_1896833868.jpeg',
  heroAlt: 'Boutique hotel lobby ready for an event setup',
  problemBullets: [
    'Inquiries arriving in three different inboxes, an Instagram DM, and one voicemail nobody listens to.',
    'Proposals built in Word, exported to PDF, emailed, and then never followed up on.',
    'A spreadsheet that tries to track which proposals are open, which are paid, and which were forgotten about.',
    'No way to know your inquiry-to-booking conversion rate, so no way to improve it.',
  ],
  outcomeBullets: [
    {
      title: 'Every inquiry lands in one pipeline.',
      body: 'Web form, phone log, walk-in — they all enter the same inquiry list with a status, an owner, and a follow-up date. The 11 PM inquiry doesn’t get lost because the front desk shift changed.',
    },
    {
      title: 'Proposals out the door in under five minutes.',
      body: 'Pick from saved packages, edit pricing inline, send as a branded PDF. The client gets a clean document; you keep the version history. No more Word template archaeology.',
    },
    {
      title: 'Payment tracking is built in.',
      body: 'Invoices are part of the same pipeline as proposals. Mark deposits received, send reminders for balances due. Your bookkeeper sees the same numbers you do.',
    },
    {
      title: 'Inquiry-to-booking conversion finally measurable.',
      body: 'You see how many inquiries turned into proposals, how many proposals turned into bookings, and where the drop-off is. Decisions stop being “I think we’re losing too many.”',
    },
  ],
  steps: [
    {
      n: '01',
      title: 'Capture the inquiry.',
      body: 'A guest fills out your inquiry form, or your front desk logs a phone call. Either way, the inquiry lands on the pipeline with a follow-up date.',
    },
    {
      n: '02',
      title: 'Send a branded proposal.',
      body: 'Pick a package, adjust pricing, hit send. The client receives a PDF that looks like your hotel — not a Word template — with one-click accept.',
    },
    {
      n: '03',
      title: 'Track payment to close.',
      body: 'Deposit invoice, balance invoice, paid-in-full status. Cancellations, refunds, and rebookings live in the same record. Your bookkeeper exports a clean monthly summary.',
    },
  ],
  faq: [
    {
      q: 'Does this replace my PMS?',
      a: 'No. MyHotelOps Events sits alongside your PMS. Your reservation system continues to own rooms, the folio, and the night audit. Event proposals and catering live here because that’s a different sales motion entirely — and most PMS suites handle it badly or not at all.',
    },
    {
      q: 'Can we customize the proposal template to match our brand?',
      a: 'Yes. Branded PDFs use your hotel’s color palette, logo, and a template that includes your standard terms. Each proposal is editable per-event without breaking the template.',
    },
    {
      q: 'How does payment work?',
      a: 'Invoices are issued from the same pipeline as the proposal. You can take payment through your existing processor; MyHotelOps tracks the status (deposit due / deposit received / balance due / paid in full) and surfaces overdue invoices on the dashboard.',
    },
    {
      q: 'How much does it cost?',
      a: 'A flat $100 per property per month. No per-event fee, no per-proposal fee, no transaction percentage. Events is part of the base subscription — alongside maintenance, IT hub, media, and arrival pages.',
    },
    {
      q: 'How long does setup take?',
      a: 'About thirty minutes to set up your event packages, branded template, and inquiry form. The 7-day free trial gives you full access to test the entire flow end-to-end before paying anything.',
    },
  ],
  featuresAnchor: '#operations',
}

export const metadata: Metadata = lpRootMetadata(content)

export default function Page() {
  return <LpPage content={content} />
}
