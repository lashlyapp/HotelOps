import type { Metadata } from 'next'
import {
  LpPage,
  lpRootMetadata,
  type LpContent,
} from '@/components/marketing/lp-layout'

// Flagship LP for the Revenue Intelligence module. Frames MyHotelOps
// as an AI commercial radar for boutique hotels rather than another
// ops tool — see docs/revenue-intelligence.md for the strategic
// positioning the copy here honors.

const content: LpContent = {
  slug: 'revenue-intelligence',
  metaTitle:
    'AI Market Intelligence for Independent Hotels — MyHotelOps',
  metaDescription:
    'Real-time commercial radar for boutique hotels — OTA pricing movement, demand surges, competitor activity, AI-drafted daily briefings. No PMS integration, no analyst dashboards, no enterprise complexity.',
  eyebrow: 'AI hospitality market intelligence',
  heroHeadline: 'Know what is happening around your hotel.',
  heroSub:
    'A commercial radar built for independent and boutique hotels. Monitor competitor pricing, OTA visibility, local demand, and inventory tightening — without PMS integrations, analyst dashboards, or enterprise onboarding. Bundled with the platform; one license, no upcharges.',
  heroImage: '/AdobeStock_94588323.jpeg',
  heroAlt:
    'Hotel manager reviewing market intelligence on a tablet at the front desk',
  problemBullets: [
    'No way to tell whether your weekend pricing is leaving money on the table or scaring guests off — every Saturday is a guess.',
    'A convention or concert is in town and you find out from the front desk on Saturday morning when you should have repriced two weeks ago.',
    'Comparable boutiques quietly raise rates and you keep matching last month’s ADR because nobody told you the market moved.',
    'Enterprise revenue tools want $400+ per month, a PMS integration, and a quarter of analyst onboarding before they say anything useful.',
  ],
  outcomeBullets: [
    {
      title: 'A daily executive briefing instead of a dashboard.',
      body: 'Open your phone over coffee and read one short page: today\'s demand outlook, two or three pricing opportunities, one alert. No charts, no spreadsheets, no analyst translation required.',
    },
    {
      title: 'Comp set discovered automatically.',
      body: 'Nearby boutiques are detected from the moment your property is created. You never configure a competitor list. Their pricing and availability shape your recommendations the same day.',
    },
    {
      title: 'Real OTA pricing pressure, not generic advice.',
      body: 'When comparable Booking.com or Expedia listings are tightening for Saturday, you find out Monday — with a concrete suggested rate, not “monitor the market closely.”',
    },
    {
      title: 'Built for independent hotels, not Marriott.',
      body: 'No PMS integration, no contract, no analyst seat fee. Runs alongside whatever reservation system you already use. Cancels in one click from your account.',
    },
  ],
  steps: [
    {
      n: '01',
      title: 'Property goes in.',
      body: 'Add the property like any other onboarding step. Market segment, ADR band, comp set, and local context are inferred automatically from public sources. No spreadsheet to fill out.',
    },
    {
      n: '02',
      title: 'The radar runs.',
      body: 'Every few hours the platform pulls comp-set rates, OTA availability, local events, search-demand signals, weather disruption, and review sentiment. Cleansed, normalized, and stored for trend analysis — no PMS data ever required.',
    },
    {
      n: '03',
      title: 'You get the briefing.',
      body: 'At 6 a.m. an AI-drafted executive briefing lands in your inbox: outlook, demand signals, comp-set movement, and 2–3 specific pricing opportunities. Open the app to drill in; act in one click. Or close the email and trust the radar.',
    },
  ],
  faq: [
    {
      q: 'Does this require connecting my PMS?',
      a: 'No. The Revenue Intelligence layer is external commercial intelligence by design — it monitors OTA pricing, demand events, competitor activity, weather, and search demand around your hotel without ever reading from your PMS, booking engine, or reservation system. Your existing reservation system continues to own bookings.',
    },
    {
      q: 'How is this different from Lighthouse / OTA Insight / RateGain?',
      a: 'Those tools are enterprise revenue analyst products — $300–800 per property per month, configuration-heavy, optimized for revenue managers staring at charts. We are AI-native, bundled in the boutique platform license, optimized for owner-operators and GMs who need a one-page briefing each morning. We can not replace Lighthouse for a 500-room flagship. We can replace it for a 25-room boutique that never had a revenue analyst in the first place.',
    },
    {
      q: 'Where does the competitor data come from?',
      a: 'Comp set is auto-discovered from OpenStreetMap (nearby boutique properties). Live competitor rates come from licensed OTA affiliate APIs — Booking.com Affiliate, Expedia Rapid (EAN), Hotelbeds — when those credentials are connected. Review intelligence comes from your TripAdvisor URL. Local events come from Ticketmaster, Eventbrite, and Wikipedia. Everything else is scraped from free public sources (weather, holidays, search demand). No private data, no PMS access.',
    },
    {
      q: 'How much does it cost?',
      a: 'Bundled in the boutique platform license — one flat per-property price covers Revenue Intelligence and every operational module (work orders, events, signage, social, arrival pages). No per-feature add-on, no analyst seat fee, no enterprise contract. Full pricing on the pricing page.',
    },
    {
      q: 'How long does it take to set up?',
      a: 'Zero. The first time you open the Market page, the platform auto-detects your segment, comp set, and location. The day-one briefing pulls from public sources immediately. OTA rate intelligence activates the moment your affiliate keys are connected; everything else is live on the first visit.',
    },
    {
      q: 'Will my data be used to train models or shared with competitors?',
      a: 'No. We never share an identifiable property’s data with another customer. The only cross-tenant signal is an optional, anonymized peer ADR benchmark — opt-in per organization, your contribution is HMAC-hashed before storage, and the cohort must have at least three contributing properties before any number is shown. If three boutiques in your city opt in, you all see a city benchmark; below three, nobody sees anything.',
    },
  ],
  featuresAnchor: '#market-intelligence',
}

export const metadata: Metadata = lpRootMetadata(content)

export default function Page() {
  return <LpPage content={content} />
}
