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
 * Categorized grid because the surface area is ~20 features. A
 * flat list overwhelms; categories let a scanner find their
 * concern (operations vs guest-facing vs billing) in two seconds.
 *
 * Six categories laid out in a 2-column grid (3 rows). Item counts
 * vary — currently 4 everywhere except Add-ons (3). The grid sizes
 * categories, not items, so unevenness inside a category doesn't
 * matter. Dictionary copy is the source of truth; this component
 * only renders structure. Anchor slugs are positional (CATEGORY_SLUGS)
 * so the landing-page FeaturesDropdown can deep-link to the same
 * anchor across locales even though category titles are translated.
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

        <div className="mt-12 grid gap-x-10 gap-y-12 md:grid-cols-2">
          {t.categories.map((category, i) => (
            <div
              key={category.title}
              id={CATEGORY_SLUGS[i]}
              className="scroll-mt-24"
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-fg border-b border-border-subtle pb-3">
                {category.title}
              </h3>
              <dl className="mt-5 space-y-5">
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
