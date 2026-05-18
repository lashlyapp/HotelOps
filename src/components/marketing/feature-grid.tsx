import type { Dictionary } from '@/lib/i18n/dictionaries'

/**
 * Comprehensive feature catalog band. Sits between the positioning
 * section and the destinations bands — the page narrative reads:
 *
 *   hero → "everything your PMS doesn't do"
 *   positioning → "we're not your PMS"
 *   features → here's the breadth, in one scan        ← this
 *   destinations → here's the markets we serve
 *   use-cases → here's customers who did it
 *   modules → here are deep-dives on the headliners
 *   pricing → here's what it costs
 *
 * Categorized list because the surface area is ~20 features. A
 * flat list overwhelms; categories let a scanner find their
 * concern (operations vs guest-facing vs billing) in two seconds.
 *
 * The outer container matches the rest of the marketing pages at
 * max-w-6xl. Category headings span full-width so anchor deep-links
 * from the navbar FeaturesDropdown still land cleanly at the top of
 * each section. Items inside a category go 2-up on desktop to fill
 * the gutter without compromising readability — the dictionary copy
 * stays the source of truth and anchor slugs (CATEGORY_SLUGS) are
 * positional so cross-locale links work.
 */
const CATEGORY_SLUGS = [
  'operations',
  'guest-facing',
  'media',
  'team',
  'billing',
  'addons',
] as const

export function FeatureGrid({
  t,
}: {
  t: Dictionary['features']
}) {
  return (
    <section
      id="features"
      className="border-y border-border-subtle bg-surface"
    >
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

        <div className="mt-12 space-y-16">
          {t.categories.map((category, i) => (
            <div
              key={category.title}
              id={CATEGORY_SLUGS[i]}
              className="scroll-mt-24"
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-fg border-b border-border-subtle pb-3">
                {category.title}
              </h3>
              <dl className="mt-5 grid gap-x-10 gap-y-5 md:grid-cols-2">
                {category.items.map((item) => (
                  <div key={item.name}>
                    <dt className="text-sm font-semibold text-fg">
                      {item.name}
                    </dt>
                    <dd className="mt-1 text-sm text-muted leading-relaxed">
                      {item.description}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
