import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function EventsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-h-full">
      <header className="border-b border-border-subtle bg-surface px-8 py-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-subtle">
              Events
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-fg">
              Catering &amp; event management
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Track inquiries, build proposals, coordinate the day-of, record
              what comes in.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/events/new">
              <Button variant="primary" size="sm">
                New event
              </Button>
            </Link>
          </div>
        </div>

        <nav className="mt-5 flex flex-wrap gap-1 text-sm">
          <SubNavLink href="/events">All events</SubNavLink>
          <SubNavLink href="/events/spaces">Spaces</SubNavLink>
        </nav>
      </header>

      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}

function SubNavLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="focus-ring rounded-md px-3 py-1.5 text-muted hover:bg-surface-muted hover:text-fg"
    >
      {children}
    </Link>
  )
}
