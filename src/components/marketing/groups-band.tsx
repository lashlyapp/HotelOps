import type { Dictionary } from '@/lib/i18n/dictionaries'

export function GroupsBand({ t }: { t: Dictionary }) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          {t.groups.eyebrow}
        </p>
        <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-fg">
          {t.groups.title}
        </h2>
        <p className="mt-4 text-base text-muted leading-relaxed">
          {t.groups.sub}
        </p>
      </div>

      <ul className="mt-10 grid gap-5 sm:grid-cols-3">
        {t.groups.items.map((item) => (
          <li
            key={item.title}
            className="rounded-2xl border border-border-subtle bg-surface p-6"
          >
            <h3 className="text-base font-semibold text-fg leading-snug">
              {item.title}
            </h3>
            <p className="mt-2 text-sm text-muted leading-relaxed">
              {item.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
