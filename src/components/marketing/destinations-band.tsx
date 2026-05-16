import Image from 'next/image'
import Link from 'next/link'
import type { Dictionary } from '@/lib/i18n/dictionaries'

/**
 * City-targeted band on the marketing landing page. Each card stays
 * in the destination's native language regardless of the active
 * visitor locale — a French visitor still sees the Lisbon card in
 * Portuguese, because that's the language that matters for local
 * SEO and for the emotional "they get my market" signal. Only the
 * intro band copy (eyebrow / title / sub) follows the visitor
 * locale via the passed-in dictionary.
 *
 * NOT a claim of existing customers. Copy is framed as "built for
 * boutique hotels in <city>" — aspirational positioning, not
 * testimony. Don't add fake logos / reviews / counts here without
 * real attribution.
 *
 * Photos: each card references a landmark image under
 * /public/landmarks/. Drop in licensed photos (see the README in
 * that folder) before launching the band. Until they're in place,
 * the band still renders — next/image will show its broken-image
 * placeholder for the missing files, which is visible in dev but
 * doesn't crash the page.
 */
type Destination = {
  slug: string
  imageSrc: string
  imageAlt: string
  /** lang attribute for the card content — flips screenreader voice
   *  + helps search engines index the localized text correctly. */
  lang: string
  city: string
  neighborhoods: string
  headline: string
  sub: string
}

// Image paths point at the existing licensed Adobe Stock hospitality
// imagery already in /public. They're not city-specific (a hotel
// exterior is a hotel exterior) but they're polished, licensed for
// commercial use, and guarantee no broken-image placeholders go to
// production. Swap each entry for the corresponding city-landmark
// photo when the new licensed photos land — see
// /public/landmarks/README.md for the full spec + intended mapping.
const DESTINATIONS: Destination[] = [
  {
    slug: 'lisbon',
    imageSrc: '/AdobeStock_1951250090.jpeg',
    imageAlt: 'Boutique hotel in Lisbon — placeholder imagery',
    lang: 'pt',
    city: 'Lisboa',
    neighborhoods: 'Alfama · Chiado · Bairro Alto',
    headline: 'Hotéis boutique em Lisboa',
    sub: "MyHotelOps para a Baixa, Alfama e Chiado — e cada propriedade entre eles. Tudo o que o seu PMS não faz, num só lugar.",
  },
  {
    slug: 'barcelona',
    imageSrc: '/AdobeStock_1896833868.jpeg',
    imageAlt: 'Boutique hotel in Barcelona — placeholder imagery',
    lang: 'es',
    city: 'Barcelona',
    neighborhoods: 'El Born · Gòtic · Eixample',
    headline: 'Hoteles boutique en Barcelona',
    sub: 'MyHotelOps para El Born, Gòtic y Eixample — y cada propiedad entre ellos. Todo lo que tu PMS no hace, en un solo lugar.',
  },
  {
    slug: 'paris',
    imageSrc: '/AdobeStock_327436679.jpeg',
    imageAlt: 'Boutique hotel in Paris — placeholder imagery',
    lang: 'fr',
    city: 'Paris',
    neighborhoods: 'Le Marais · Saint-Germain · Montmartre',
    headline: 'Hôtels boutique à Paris',
    sub: "MyHotelOps pour Le Marais, Saint-Germain et Montmartre — et chaque propriété entre les deux. Tout ce que votre PMS ne fait pas, au même endroit.",
  },
  {
    slug: 'mexico-city',
    imageSrc: '/AdobeStock_131189921.jpeg',
    imageAlt: 'Boutique hotel in Mexico City — placeholder imagery',
    lang: 'es',
    city: 'Ciudad de México',
    neighborhoods: 'Roma · Condesa · Polanco',
    headline: 'Hoteles boutique en Ciudad de México',
    sub: 'MyHotelOps para Roma, Condesa y Polanco — y cada propiedad entre ellas. Todo lo que tu PMS no hace, en un solo lugar.',
  },
]

export function DestinationsBand({ t }: { t: Dictionary }) {
  return (
    <section className="border-y border-border-subtle bg-surface-muted/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t.destinations.eyebrow}
          </p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
            {t.destinations.title}
          </h2>
          <p className="mt-4 text-base text-muted leading-relaxed">
            {t.destinations.sub}
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
                    {/* CTA stays in the destination language — same SEO
                        logic. The /signup form itself reads visitor
                        locale and translates server-side. */}
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

/** Locale-flavored CTA copy. Hardcoded per language because the
 *  card content is fundamentally bilingual — the visitor's dictionary
 *  doesn't apply here. */
function ctaForLang(lang: string): string {
  switch (lang) {
    case 'pt':
      return 'Começar gratuitamente →'
    case 'es':
      return 'Comenzar gratis →'
    case 'fr':
      return 'Commencer gratuitement →'
    default:
      return 'Start free →'
  }
}
