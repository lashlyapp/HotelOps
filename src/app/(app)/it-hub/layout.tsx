import Link from 'next/link'

export default function ItHubLayout({
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
              IT Hub
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-fg">
              Everything tech, in one place
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Wi-Fi passwords, vendor logins, equipment, and IT contacts —
              centralized so the front desk never has to dig through emails
              again.
            </p>
          </div>
        </div>

        <nav className="mt-5 flex flex-wrap gap-1 text-sm">
          <SubNavLink href="/it-hub">Overview</SubNavLink>
          <SubNavLink href="/it-hub/wifi">Wi-Fi</SubNavLink>
          <SubNavLink href="/it-hub/logins">Logins</SubNavLink>
          <SubNavLink href="/it-hub/equipment">Equipment</SubNavLink>
          <SubNavLink href="/it-hub/vendors">Vendors &amp; contacts</SubNavLink>
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
