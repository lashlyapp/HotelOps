// Static "what you'll get" post shown on /social when the org doesn't
// have the Social Studio add-on active. Built once, never rotates —
// the marketing promise is "see exactly what shows up every morning,
// then turn it on." After purchase the cron's daily output replaces
// this sample.
//
// All copy lives in this file so a non-engineer can refresh it for
// a marketing-campaign refresh without touching component code.

import type { TopicKey } from './topics'

export type SamplePost = {
  topicKey: TopicKey
  topicLabel: string
  topicHint: string
  postDateLabel: string
  weatherPhrase: string
  captions: string[]
  hashtagSets: string[][]
  // Path under /public — chosen for "looks like a hotel photo" without
  // depending on any tenant's media catalog. Replace with a CDN URL if
  // we want a higher-res hero.
  imageSrc: string
  imageAlt: string
}

export const SAMPLE_POST: SamplePost = {
  topicKey: 'room_reveal',
  topicLabel: 'Room reveal',
  topicHint:
    "A room from your catalog, captioned for what's actually in the frame — the light, the linens, the view. Hotels' single most-saved post category.",
  postDateLabel: 'Sample · Tuesday morning',
  weatherPhrase: 'sunny and mild',
  captions: [
    'Window light, made for taking your time.',
    'Pendant light overhead, a daybed by the window, and the city quiet enough to read. The kind of Tuesday a hotel room earns its keep.',
    "Three things that make a Tuesday at our hotel feel like a Saturday: the window light at 9am, the second cup of coffee, and a bed you don't want to leave. Come find out.",
  ],
  hashtagSets: [
    ['#boutiquehotel', '#hotelroom', '#hotellife'],
    ['#boutiquehotel', '#suitelife', '#windowlight', '#travelvibes'],
    ['#boutiquehotel', '#independenthotel', '#travelinspiration', '#hospitality', '#staycation'],
  ],
  // Existing marketing stock — a bedroom interior with a pendant
  // light, daybed at the window, and a cityscape view. The captions
  // above are written specifically to that image so the paywall
  // preview demonstrates the real value proposition: the AI describes
  // what's literally in the photo, not a generic version of the topic.
  imageSrc: '/AdobeStock_131189921.jpeg',
  imageAlt:
    "A bedroom with a pendant light overhead and a daybed by the window — the kind of photo Social Studio would suggest from your media library, with captions written to match what's in the frame.",
}
