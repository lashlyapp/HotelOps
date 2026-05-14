import Link from 'next/link'

export default function SignageLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-h-full">
      <header className="border-b border-border-subtle bg-surface px-4 sm:px-8 py-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-subtle">
              Digital signage
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-fg">
              Screens &amp; playlists
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Show photos, videos, or text on any TV with a browser. Pair
              with a 6-digit code, build a playlist from your existing
              media library, assign and schedule.
            </p>
          </div>
          <Link
            href="/signage/screens/new"
            className="focus-ring inline-flex h-10 items-center justify-center self-start rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
          >
            + Add screen
          </Link>
        </div>

        <nav className="mt-5 flex flex-wrap gap-1 text-sm">
          <SubNavLink href="/signage">Screens</SubNavLink>
          <SubNavLink href="/signage/playlists">Playlists</SubNavLink>
          <SubNavLink href="/signage/emergency">Emergency broadcast</SubNavLink>
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
