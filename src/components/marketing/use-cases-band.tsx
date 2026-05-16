import { BRAND } from '@/lib/brand'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { interpolate } from '@/lib/i18n/interpolate'

/**
 * "How customers use it" band on the landing page. Three anonymized
 * use-case cards drawn from real paying customers — names withheld
 * by request, which is the boutique-hospitality norm.
 *
 * Edit the actual content in src/lib/i18n/dictionaries/{en,es,fr}.json
 * under `useCases.items`. Each card is a headline + a one-line
 * customer descriptor (size + region) + a short outcome paragraph.
 *
 * No logos / no quoted testimonials yet. When customers send written
 * permission to publish a quote, swap the body string for the quote
 * and add an `attribution` field.
 */
export function UseCasesBand({
  t,
}: {
  t: Dictionary['useCases']
}) {
  return (
    <section className="border-y border-border-subtle">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t.eyebrow}
          </p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
            {t.title}
          </h2>
          <p className="mt-4 text-base text-muted leading-relaxed">{t.sub}</p>
        </div>

        <ul className="mt-10 grid gap-5 lg:grid-cols-3">
          {t.items.map((item) => (
            <li
              key={item.headline}
              className="flex flex-col rounded-2xl border border-border-subtle bg-surface p-6"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-subtle">
                {item.type}
              </p>
              <h3 className="mt-3 text-lg font-semibold text-fg leading-snug">
                {item.headline}
              </h3>
              <p className="mt-3 text-sm text-muted leading-relaxed">
                {item.body}
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-8 max-w-2xl text-xs text-subtle leading-relaxed">
          {interpolate(t.footnote, { email: BRAND.supportEmail })
            .split(BRAND.supportEmail)
            .map((part, i, all) => (
              <span key={i}>
                {part}
                {i < all.length - 1 ? (
                  <a
                    href={`mailto:${BRAND.supportEmail}`}
                    className="font-medium text-fg hover:underline"
                  >
                    {BRAND.supportEmail}
                  </a>
                ) : null}
              </span>
            ))}
        </p>
      </div>
    </section>
  )
}
