import { BRAND, BRAND_ADDRESS_LINES } from '@/lib/brand'
import { Wordmark } from '@/components/brand/wordmark'

type Variant = 'public' | 'app'

export function Footer({ variant = 'public' }: { variant?: Variant }) {
  const year = new Date().getFullYear()

  if (variant === 'app') {
    return (
      <footer className="border-t border-border-subtle px-6 py-4 text-xs text-subtle">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            © {year} {BRAND.legalName}
          </span>
          <span className="font-mono">{BRAND.domain}</span>
        </div>
      </footer>
    )
  }

  return (
    <footer className="mt-auto border-t border-border-subtle bg-surface-muted">
      <div className="mx-auto max-w-6xl px-6 py-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-3">
          <Wordmark size="md" />
          <p className="text-sm text-muted max-w-xs">{BRAND.productTagline}.</p>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
            Mailing address
          </p>
          <address className="not-italic text-muted leading-6">
            {BRAND_ADDRESS_LINES.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </address>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
            Support
          </p>
          <a
            href={`mailto:${BRAND.supportEmail}`}
            className="text-muted hover:text-fg focus-ring rounded-sm"
          >
            {BRAND.supportEmail}
          </a>
        </div>
      </div>

      <div className="border-t border-border-subtle">
        <div className="mx-auto max-w-6xl px-6 py-4 text-xs text-subtle">
          © {year} {BRAND.legalName}. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
