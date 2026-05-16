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
  topicKey: 'weather_mood',
  topicLabel: 'Weather + vibe',
  topicHint:
    "Today's weather paired with what the hotel feels like right now — usually our highest-saved angle.",
  postDateLabel: 'Sample · Tuesday morning',
  weatherPhrase: 'sunny and mild',
  captions: [
    'Slow morning. Strong coffee.',
    'Sun on the terrace, the dining room still quiet. The kind of Tuesday you book a trip around.',
    'Three things that make a Tuesday at our hotel feel like a Saturday: the light at 9am, the second cup of coffee, and the fact that nobody is in a hurry. Come find out.',
  ],
  hashtagSets: [
    ['#boutiquehotel', '#slowmorning', '#hotellife'],
    ['#boutiquehotel', '#terracevibes', '#sundaymood', '#travelvibes'],
    ['#boutiquehotel', '#independenthotel', '#travelinspiration', '#hospitality', '#staycation'],
  ],
  // One of the existing marketing stock images, sized for hero use. Cheaper
  // than commissioning a dedicated sample asset, and the photo style
  // matches "boutique hotel morning" which is exactly the angle the
  // sample caption is talking to.
  imageSrc: '/AdobeStock_131189921.jpeg',
  imageAlt:
    'A bright hotel terrace with morning sun — the kind of photo Social Studio would suggest from your media library.',
}
