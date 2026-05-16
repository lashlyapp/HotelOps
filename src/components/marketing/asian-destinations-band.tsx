import Image from 'next/image'
import Link from 'next/link'
import type { Dictionary } from '@/lib/i18n/dictionaries'

/**
 * APAC city band that sits right after the existing DestinationsBand
 * on the landing page. Same idea — each card stays in the
 * destination's native language regardless of visitor locale for
 * local SEO and the "they get my market" emotional cue. Only the
 * intro band copy follows the visitor locale via the passed-in
 * dictionary.
 *
 * Markets covered:
 *   - Tokyo (ja)
 *   - Seoul (ko)
 *   - Hanoi (vi)
 *   - Singapore (en — SG business operates in English even though
 *     Singlish, Malay, Mandarin, and Tamil are official; no SG
 *     locale in our LOCALES list)
 *
 * Image sources mirror the EU/Mexico band — hotlinked Unsplash IDs
 * with the CDN's resize/quality parameters. Swap to licensed Adobe
 * Stock photos under /public/landmarks/asia/ before paid acquisition
 * in these markets.
 */
type AsianDestination = {
  slug: string
  imageSrc: string
  imageAlt: string
  /** lang attribute drives screenreader voice + search-engine
   *  language detection per-card. */
  lang: string
  city: string
  neighborhoods: string
  headline: string
  sub: string
}

const UNSPLASH = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=1200&q=80&auto=format&fit=crop`

const DESTINATIONS: AsianDestination[] = [
  {
    slug: 'tokyo',
    imageSrc: UNSPLASH('1540959733332-eab4deabeeaf'),
    imageAlt: 'Tokyo — neon-lit street in Shibuya',
    lang: 'ja',
    city: '東京',
    neighborhoods: '渋谷 · 浅草 · 銀座',
    headline: '東京のブティックホテル向け',
    sub: '渋谷、浅草、銀座、そしてその間のすべての物件のための MyHotelOps。PMSがしないことすべてを一つの場所に。',
  },
  {
    slug: 'seoul',
    imageSrc: UNSPLASH('1517154421773-0529f29ea451'),
    imageAlt: 'Seoul — Han River skyline at dusk',
    lang: 'ko',
    city: '서울',
    neighborhoods: '강남 · 이태원 · 홍대',
    headline: '서울의 부티크 호텔을 위해',
    sub: '강남, 이태원, 홍대 — 그리고 그 사이의 모든 부동산을 위한 MyHotelOps. PMS가 하지 않는 모든 것을 한 곳에서.',
  },
  {
    slug: 'hanoi',
    imageSrc: UNSPLASH('1509923973826-2da6e36c1be4'),
    imageAlt: 'Hanoi — Old Quarter street with hanging lanterns',
    lang: 'vi',
    city: 'Hà Nội',
    neighborhoods: 'Phố Cổ · Tây Hồ · Ba Đình',
    headline: 'Khách sạn boutique tại Hà Nội',
    sub: 'MyHotelOps cho Phố Cổ, Tây Hồ, Ba Đình — và mọi tài sản giữa chúng. Mọi thứ PMS của bạn không làm, ở một nơi.',
  },
  {
    slug: 'singapore',
    imageSrc: UNSPLASH('1525625293386-3f8f99389edd'),
    imageAlt: 'Singapore — Marina Bay skyline at blue hour',
    lang: 'en',
    city: 'Singapore',
    neighborhoods: 'Chinatown · Tanjong Pagar · Tiong Bahru',
    headline: 'Boutique hotels in Singapore',
    sub: 'MyHotelOps for Chinatown, Tanjong Pagar, Tiong Bahru — and every property in between. Everything your PMS doesn’t do, in one place.',
  },
]

export function AsianDestinationsBand({ t }: { t: Dictionary }) {
  return (
    <section className="border-b border-border-subtle bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t.asianDestinations.eyebrow}
          </p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
            {t.asianDestinations.title}
          </h2>
          <p className="mt-4 text-base text-muted leading-relaxed">
            {t.asianDestinations.sub}
          </p>
        </div>

        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {DESTINATIONS.map((d) => (
            <li
              key={d.slug}
              className="group overflow-hidden rounded-2xl border border-border-subtle bg-surface flex flex-col"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-surface-muted">
                <Image
                  src={d.imageSrc}
                  alt={d.imageAlt}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-4">
                  <p
                    lang={d.lang}
                    className="text-lg font-semibold text-white leading-tight"
                  >
                    {d.city}
                  </p>
                  <p className="mt-0.5 text-xs text-white/85">
                    {d.neighborhoods}
                  </p>
                </div>
              </div>
              <div lang={d.lang} className="flex flex-1 flex-col p-5">
                <h3 className="text-base font-semibold text-fg leading-snug">
                  {d.headline}
                </h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">
                  {d.sub}
                </p>
                <div className="mt-auto pt-5">
                  <Link
                    href="/signup"
                    className="focus-ring text-sm font-medium text-fg hover:underline"
                  >
                    {ctaForLang(d.lang)}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Native-language CTA. Hardcoded per language — the card is
 *  bilingual by design and doesn't read from the visitor dictionary. */
function ctaForLang(lang: string): string {
  switch (lang) {
    case 'ja':
      return '無料で始める →'
    case 'ko':
      return '무료로 시작 →'
    case 'vi':
      return 'Bắt đầu miễn phí →'
    default:
      return 'Start free →'
  }
}
