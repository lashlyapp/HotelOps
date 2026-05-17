import type { Metadata } from 'next'
import {
  LpPage,
  lpRootMetadata,
  type LpContent,
} from '@/components/marketing/lp-layout'

const content: LpContent = {
  slug: 'social-studio',
  metaTitle: 'Social posts for boutique hotels — one AI-drafted post per day | MyHotelOps',
  metaDescription:
    'One AI-drafted social post per property, every morning — caption, hashtags, and a photo picked from your own media library. Copy, download, or email to yourself; you publish from your phone. No platform integrations, no OAuth, your accounts stay yours.',
  eyebrow: 'Social Studio',
  heroHeadline: 'A social post a day. Ready before you finish your coffee.',
  heroSub:
    'Social Studio drafts one ready-to-publish social post per property every morning at 6 AM local — caption, hashtags, and a photo picked from your own media library. Copy, download, or email it to yourself; you post from your phone. No platform integrations that break, no OAuth grants to manage, your social accounts stay yours.',
  heroImage: '/AdobeStock_1951250090.jpeg',
  heroAlt: 'Boutique hotel exterior at golden hour',
  problemBullets: [
    'A boutique hotel Instagram that hasn’t posted since the summer of two years ago.',
    'A GM with five jobs and no marketing team, who knows the hotel should be posting daily but can never get to it.',
    'A laundry list of “tools” that promise to schedule posts but each requires an OAuth grant that breaks every quarter.',
    'A folder of beautiful photos of the property that nobody is using because nobody has the time to write captions for them.',
  ],
  outcomeBullets: [
    {
      title: 'A draft waiting every morning at 6 AM local.',
      body: 'Show up at 6 AM, find a post ready: caption written in your brand voice, three to five suggested hashtags including your signature ones, a photo selected from your own catalog (or, if your catalog runs thin, a complementary Unsplash photo with proper credit).',
    },
    {
      title: 'You stay in control of what ships.',
      body: 'Pick from multiple caption variants, edit anything, swap the photo from a one-click frame picker. Nothing posts automatically. The act of publishing stays on your phone — same workflow you already use, just with the heavy lifting done.',
    },
    {
      title: 'Your accounts stay yours.',
      body: 'No platform OAuth. No “authorize MyHotelOps to post to Instagram” dialogs that break every time Meta changes their API. We never touch your social accounts; you copy or download the post and ship it manually from the phone the account is logged in on.',
    },
    {
      title: 'Brand voice that doesn’t sound like a chatbot.',
      body: 'Set your signature hashtags, social handles, and brand voice in settings once. Every morning’s draft sounds like the property, not like generic AI marketing slop. Feedback (👍/👎 on each caption) tunes the next draft.',
    },
  ],
  steps: [
    {
      n: '01',
      title: 'Set your voice and hashtags once.',
      body: 'Brand voice, signature hashtags, social handles, topic preferences. Takes five minutes. Lives at /social/settings.',
    },
    {
      n: '02',
      title: 'Every morning, a draft is waiting.',
      body: '6 AM local: a caption, three caption variants, suggested hashtag sets, and a photo (from your catalog or Unsplash). Read it on the train, edit if needed.',
    },
    {
      n: '03',
      title: 'Copy to your phone, post manually.',
      body: 'One tap to copy the caption + hashtags, download the image, paste into Instagram (or X, or Facebook, or LinkedIn). Mark “used” when you’ve shipped it; the timeline shows what you’ve posted.',
    },
  ],
  faq: [
    {
      q: 'Does Social Studio post to Instagram for me automatically?',
      a: 'No, and that’s by design. Social Studio drafts the post each morning — caption, hashtags, suggested photo — and lets you copy, download, or email it to yourself. You publish from your phone. No platform integrations that break, no OAuth grants to manage, and your social accounts stay yours.',
    },
    {
      q: 'How much does Social Studio cost?',
      a: 'Social Studio is an optional add-on, billed prorated on top of the $100/property/month base subscription. Toggle it on or off from /billing whenever you want. The base subscription stays whether or not you use the add-on.',
    },
    {
      q: 'Where do the photos come from?',
      a: 'First, from your own media catalog — the photos you’ve already uploaded to your property’s library. When the library runs thin (newer properties, or after the daily picker has cycled through), Social Studio falls back to Unsplash with proper photographer credit included in the suggested caption.',
    },
    {
      q: 'Can I customize the brand voice?',
      a: 'Yes. Per-property voice settings (formal / warm / cheeky / minimal), signature hashtags, and social handles. The voice is honored every morning. Feedback on individual captions (thumbs up or down) further tunes the next draft.',
    },
    {
      q: 'What platforms is it built for?',
      a: 'Anywhere you publish manually: Instagram, X, Facebook, LinkedIn, TikTok captions, Threads. The drafts are platform-agnostic; the post-card UI shows you previews for the major platforms so you know how it’ll read before you ship.',
    },
  ],
  featuresAnchor: '#addons',
}

export const metadata: Metadata = lpRootMetadata(content)

export default function Page() {
  return <LpPage content={content} />
}
